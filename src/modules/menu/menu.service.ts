import { forwardRef, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { OrderService } from '../order/order.service';
import { User } from '../user/user.schema';
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
  ) {}

  findAllCategories() {
    return this.categoryModel.find().sort({ order: 'asc' });
  }

  findAllItems() {
    return this.itemModel.find().sort({ order: 'asc' });
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
    const lastItem = await this.itemModel.findOne({}).sort({ order: 'desc' });
    const item = await this.itemModel.create({
      ...createItemDto,
      order: lastItem ? lastItem.order + 1 : 1,
    });
    this.menuGateway.emitItemChanged(user, item);
    return item;
  }

  async updateItem(user: User, id: number, updates: UpdateQuery<MenuCategory>) {
    if (updates.hasOwnProperty('price')) {
      const item = await this.itemModel.findById(id);
      if (!item) {
        throw new Error('Item not found');
      }
      updates.priceHistory =
        item.price !== updates.price
          ? [
              ...item.priceHistory,
              {
                price: updates.price,
                date: new Date().toISOString(),
              },
            ]
          : item.priceHistory;
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
    const item = await this.itemModel.findByIdAndRemove(id);
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
