import { forwardRef, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
import { OrderService } from '../order/order.service';
import { User } from '../user/user.schema';
import { AccountingService } from './../accounting/accounting.service';
import { PanelControlService } from './../panelControl/panelControl.service';
import { MenuCategory } from './category.schema';
import { MenuItem } from './item.schema';
import { Kitchen } from './kitchen.schema';
import {
  CreateCategoryDto,
  CreateItemDto,
  CreateKitchenDto,
  CreatePopularDto,
} from './menu.dto';
import { MenuGateway } from './menu.gateway';
import { Popular } from './popular.schema';

export class MenuService {
  constructor(
    @InjectModel(MenuCategory.name)
    private categoryModel: Model<MenuCategory>,
    @InjectModel(MenuItem.name) private itemModel: Model<MenuItem>,
    @InjectModel(Popular.name) private popularModel: Model<Popular>,
    @InjectModel(Kitchen.name) private kitchenModel: Model<Kitchen>,
    private readonly menuGateway: MenuGateway,
    private readonly panelControlService: PanelControlService,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    @Inject(forwardRef(() => AccountingService))
    private readonly accountingService: AccountingService,
    private readonly activityService: ActivityService,
  ) {}

  findAllCategories() {
    return this.categoryModel.find().sort({ order: 'asc' });
  }

  findAllItems() {
    return this.itemModel.find().sort({ category: 1, order: 1 });
  }

  async setOrder(user: User) {
    const items = await this.itemModel.find();
    items.forEach(async (item, index) => {
      await this.itemModel.findByIdAndUpdate(item._id, { order: index + 1 });
    });
    this.menuGateway.emitItemChanged(user, items);
  }
  async createCategory(user: User, createCategoryDto: CreateCategoryDto) {
    const lastCategory = await this.categoryModel
      .findOne({})
      .sort({ order: 'desc' });
    const category = await this.categoryModel.create({
      ...createCategoryDto,
      order: lastCategory ? lastCategory.order + 1 : 1,
      locations: [1, 2],
    });
    this.menuGateway.emitCategoryChanged(user, category);
    return category;
  }

  async updateCategory(
    user: User,
    id: number,
    updates: UpdateQuery<MenuCategory>,
  ) {
    const category = await this.categoryModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.menuGateway.emitCategoryChanged(user, category);
    return category;
  }
  async removeCategory(user: User, id: number) {
    const itemsWithCategory = await this.itemModel.find({ category: id });
    if (itemsWithCategory.length > 0) {
      throw new HttpException('Category has items', HttpStatus.BAD_REQUEST);
    }
    try {
      const categories = await this.categoryModel.find();
      const deletedCategory = categories.find(
        (category) => category._id.toString() === id.toString(),
      );
      categories?.forEach(async (category) => {
        if (category?.order > deletedCategory?.order) {
          await this.categoryModel.findByIdAndUpdate(category._id, {
            order: category?.order - 1,
          });
        }
      });
    } catch (error) {
      throw new Error('Problem occured while deleting category');
    }
    const category = await this.categoryModel.findByIdAndRemove(id);
    this.menuGateway.emitCategoryChanged(user, category);
    return category;
  }

  async createItem(user: User, createItemDto: CreateItemDto) {
    try {
      const lastItem = await this.itemModel.findOne({}).sort({ order: 'desc' });
      const item = new this.itemModel({
        ...createItemDto,
        order: lastItem ? lastItem.order + 1 : 1,
      });

      if (createItemDto?.matchedProduct) {
        const items = await this.itemModel.find({
          matchedProduct: createItemDto.matchedProduct,
        });

        if (items.length > 0) {
          for (const existingItem of items) {
            await this.itemModel.findByIdAndUpdate(existingItem._id, {
              matchedProduct: null,
              itemProduction: existingItem.itemProduction.filter(
                (ip) => ip.product !== existingItem.matchedProduct,
              ),
            });
          }
        }

        item.itemProduction = [
          {
            product: createItemDto.matchedProduct,
            quantity: 1,
            isDecrementStock: true,
          },
        ];

        await this.accountingService.updateItemProduct(
          user,
          createItemDto.matchedProduct,
          { matchedMenuItem: item._id },
        );
      }

      await item.save();
      this.menuGateway.emitItemChanged(user, item);
      return item;
    } catch (error) {
      console.error('Error creating item:', error);
      throw new HttpException(
        `Error creating item: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateItem(user: User, id: number, updates: UpdateQuery<MenuItem>) {
    const item = await this.itemModel.findById(id);
    if (!item) {
      throw new Error('Item not found');
    }

    if (updates?.matchedProduct) {
      const items = await this.itemModel.find({
        matchedProduct: updates.matchedProduct,
      });
      if (items.length > 0) {
        for (const existingItem of items) {
          await this.itemModel.findByIdAndUpdate(existingItem._id, {
            matchedProduct: null,
            itemProduction: [
              ...existingItem?.itemProduction?.filter(
                (itemProductionItem) =>
                  itemProductionItem.product !== existingItem.matchedProduct,
              ),
            ],
          });
        }
      }
      if (
        !item?.matchedProduct ||
        item.matchedProduct !== updates.matchedProduct
      ) {
        updates.itemProduction = [
          ...item.itemProduction.filter(
            (itemProductionItem) =>
              ![item.matchedProduct, updates.matchedProduct].includes(
                itemProductionItem.product,
              ),
          ),
          {
            product: updates.matchedProduct,
            quantity: 1,
            isDecrementStock: true,
          },
        ];

        await this.accountingService.updateItemProduct(
          user,
          updates.matchedProduct,
          {
            matchedMenuItem: item._id,
          },
        );
        if (
          item?.matchedProduct &&
          item?.matchedProduct !== updates.matchedProduct
        ) {
          await this.accountingService.updateItemProduct(
            user,
            item.matchedProduct,
            {
              matchedMenuItem: null,
            },
          );
        }
      }
    }
    // if matched product removed from an item
    if (item?.matchedProduct && !updates.matchedProduct) {
      updates.itemProduction = [
        ...item.itemProduction.filter(
          (itemProductionItem) =>
            itemProductionItem.product !== item.matchedProduct,
        ),
      ];
      await this.accountingService.updateItemProduct(
        user,
        item.matchedProduct,
        {
          matchedMenuItem: null,
        },
      );
    }

    if (updates.hasOwnProperty('price') && item.price !== updates.price) {
      updates.priceHistory = [
        ...item.priceHistory,
        { price: updates.price, date: new Date().toISOString() },
      ];
    }

    const updatedItem = await this.itemModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.activityService.addUpdateActivity(
      user,
      ActivityType.UPDATE_MENU_ITEM,
      item,
      updatedItem,
    );
    this.menuGateway.emitItemChanged(user, updatedItem);
    return updatedItem;
  }
  async updateMultipleItems(user: User, items: MenuItem[]) {
    if (!items?.length) {
      return;
    }
    try {
      await Promise.all(
        items.map(async (item) => {
          const foundItem = await this.itemModel.findById(item._id);
          if (!foundItem) {
            return;
          }
          if (foundItem.price !== item.price) {
            foundItem.priceHistory.push({
              price: item.price,
              date: new Date().toISOString(),
            });
          }
          foundItem.name = item.name;
          foundItem.price = item.price;
          if (item?.onlinePrice && (item.onlinePrice as any) !== '-') {
            foundItem.onlinePrice = item.onlinePrice;
          }
          await foundItem.save();
        }),
      );
      this.menuGateway.emitItemChanged(user, items);
    } catch (error) {
      console.error('Error updating items:', error);
      throw new HttpException(
        'Failed to update some items',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateProductItem(
    user: User,
    id: number,
    updates: UpdateQuery<MenuItem>,
  ) {
    const item = await this.itemModel.findById(id);
    if (!item) {
      throw new Error('Item not found');
    }

    if (updates?.matchedProduct) {
      const items = await this.itemModel.find({
        matchedProduct: updates.matchedProduct,
      });
      if (items.length > 0) {
        for (const existingItem of items) {
          await this.itemModel.findByIdAndUpdate(existingItem._id, {
            matchedProduct: null,
            itemProduction: [
              ...existingItem.itemProduction.filter(
                (itemProductionItem) =>
                  itemProductionItem.product !== existingItem.matchedProduct,
              ),
            ],
          });
        }
      }
      if (
        !item?.matchedProduct ||
        item.matchedProduct !== updates.matchedProduct
      ) {
        updates.itemProduction = updates.itemProduction = [
          ...item.itemProduction.filter(
            (itemProductionItem) =>
              ![item.matchedProduct, updates.matchedProduct].includes(
                itemProductionItem.product,
              ),
          ),
          {
            product: updates.matchedProduct,
            quantity: 1,
            isDecrementStock: true,
          },
        ];
      }
    }
    // if matched product removed from an item
    if (item?.matchedProduct && !updates.matchedProduct) {
      updates.itemProduction = [
        ...item.itemProduction.filter(
          (itemProductionItem) =>
            itemProductionItem.product !== item.matchedProduct,
        ),
      ];
      await this.accountingService.updateItemProduct(
        user,
        item.matchedProduct,
        {
          matchedMenuItem: null,
        },
      );
    }

    if (updates.hasOwnProperty('price') && item.price !== updates.price) {
      updates.priceHistory = [
        ...item.priceHistory,
        { price: updates.price, date: new Date().toISOString() },
      ];
    }

    const updatedItem = await this.itemModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.menuGateway.emitItemChanged(user, updatedItem);
    return updatedItem;
  }

  async removeItem(user: User, id: number) {
    const itemOrders = await this.orderService.findOrderByItemId(id);
    if (itemOrders?.length > 0) {
      throw new HttpException(
        'Item is already ordered',
        HttpStatus.BAD_REQUEST,
      );
    }
    const item = await this.itemModel.findById(id);
    if (item?.matchedProduct) {
      await this.accountingService.updateItemProduct(
        user,
        item.matchedProduct,
        { matchedMenuItem: null },
      );
    }
    await item.remove();
    this.menuGateway.emitItemChanged(user, item);
    return item;
  }

  // popular
  async findAllPopular() {
    return this.popularModel.find().sort({ order: 'asc' });
  }

  async createPopular(user: User, createPopularDto: CreatePopularDto) {
    const popularItems = await this.popularModel.find().populate('item');
    const lastItem = popularItems[popularItems?.length - 1];

    const popularItem = await this.popularModel.create({
      ...createPopularDto,
      order: lastItem ? lastItem.order + 1 : 1,
    });
    this.menuGateway.emitPopularChanged(user, popularItem);
    return popularItem;
  }

  async removePopular(user: User, id: number) {
    const popularItem = await this.popularModel.findOneAndDelete({ item: id });
    this.menuGateway.emitPopularChanged(user, popularItem);
    return popularItem;
  }
  async updatePopular(user: User, id: number, updates: UpdateQuery<Popular>) {
    const popularItem = await this.popularModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.menuGateway.emitPopularChanged(user, popularItem);
    return popularItem;
  }

  async updateMenuItemProduct(
    user: User,
    stayedProduct: string,
    removedProduct: string,
  ) {
    const items = await this.itemModel.find();

    items.forEach(async (item) => {
      let isUpdated = false;
      const updatedItemProduction = item.itemProduction.map(
        (itemProduction) => {
          if (itemProduction.product === removedProduct) {
            isUpdated = true;
            return {
              ...itemProduction,
              product: stayedProduct,
            };
          }
          return itemProduction;
        },
      );
      if (isUpdated) {
        await this.itemModel.findByIdAndUpdate(item._id, {
          $set: { itemProduction: updatedItemProduction },
        });
      }
    });
    this.menuGateway.emitItemChanged(user, items);
  }
  // kitchen
  findAllKitchens() {
    return this.kitchenModel.find();
  }

  async createKitchen(user: User, createKitchenDto: CreateKitchenDto) {
    const kitchen = new this.kitchenModel(createKitchenDto);
    kitchen._id = usernamify(createKitchenDto.name);
    await kitchen.save();
    const ordersPage = await this.panelControlService.getPage('orders');
    ordersPage.tabs.push({
      name: kitchen.name,
      permissionsRoles: [1],
    });
    await ordersPage.save();
    this.menuGateway.emitKitchenChanged(user, kitchen);
    return kitchen;
  }
  async updateKitchen(user: User, id: string, updates: UpdateQuery<Kitchen>) {
    const kitchen = await this.kitchenModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.menuGateway.emitKitchenChanged(user, kitchen);
    return kitchen;
  }
  async removeKitchen(user: User, id: string) {
    const kitchen = await this.kitchenModel.findById(id);
    const ordersPage = await this.panelControlService.getPage('orders');
    ordersPage.tabs = ordersPage.tabs.filter(
      (tab) => tab.name !== kitchen.name,
    );

    await kitchen.remove();
    this.menuGateway.emitKitchenChanged(user, kitchen);
    return kitchen;
  }
}
