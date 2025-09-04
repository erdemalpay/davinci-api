import { forwardRef, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { format } from 'date-fns';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { StockHistoryStatusEnum } from '../accounting/accounting.dto';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
import { NotificationEventType } from '../notification/notification.dto';
import { NotificationService } from '../notification/notification.service';
import { OrderService } from '../order/order.service';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { User } from '../user/user.schema';
import { VisitService } from '../visit/visit.service';
import { AccountingService } from './../accounting/accounting.service';
import { IkasService } from './../ikas/ikas.service';
import { LocationService } from './../location/location.service';
import { PanelControlService } from './../panelControl/panelControl.service';
import { MenuCategory } from './category.schema';
import { MenuItem, PriceHistory } from './item.schema';
import { Kitchen } from './kitchen.schema';
import {
  CreateBulkItemDto,
  CreateCategoryDto,
  CreateItemDto,
  CreateKitchenDto,
  CreatePopularDto,
  CreateUpperCategoryDto,
} from './menu.dto';
import { MenuGateway } from './menu.gateway';
import { Popular } from './popular.schema';
import { UpperCategory } from './upperCategory.schema';

interface SeenUsers {
  [key: string]: boolean;
}
export class MenuService {
  constructor(
    @InjectModel(MenuCategory.name)
    private categoryModel: Model<MenuCategory>,
    @InjectModel(MenuItem.name) private itemModel: Model<MenuItem>,
    @InjectModel(Popular.name) private popularModel: Model<Popular>,
    @InjectModel(Kitchen.name) private kitchenModel: Model<Kitchen>,
    @InjectModel(UpperCategory.name)
    private upperCategoryModel: Model<UpperCategory>,
    private readonly menuGateway: MenuGateway,
    private readonly panelControlService: PanelControlService,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    @Inject(forwardRef(() => AccountingService))
    private readonly accountingService: AccountingService,
    @Inject(forwardRef(() => IkasService))
    private readonly IkasService: IkasService,
    private readonly locationService: LocationService,
    private readonly redisService: RedisService,
    private readonly activityService: ActivityService,
    private readonly notificationService: NotificationService,
    private readonly visitService: VisitService,
  ) {}

  findAllCategories() {
    return this.categoryModel.find().sort({ order: 'asc' });
  }
  findActiveCategories() {
    return this.categoryModel.find({ active: true }).sort({ order: 'asc' });
  }
  async findAllItems(): Promise<MenuItem[]> {
    return this.itemModel.find().sort({ order: 'asc' }).exec();
  }
  async findAllUndeletedItems() {
    try {
      // Attempt to retrieve items from Redis cache
      const redisItems = await this.redisService.get(RedisKeys.MenuItems);
      if (redisItems) {
        return redisItems; // Return cached items if available
      }
    } catch (error) {
      console.error('Failed to retrieve items from Redis:', error);
    }

    try {
      const allItems = await this.itemModel
        .find({ deleted: { $ne: true } })
        .sort({ category: 1, order: 1 })
        .exec();

      // If items are found, cache them in Redis
      if (allItems.length > 0) {
        await this.redisService.set(RedisKeys.MenuItems, allItems);
      }
      return allItems; // Return items from the database
    } catch (error) {
      console.error('Failed to retrieve items from database:', error);
      throw new HttpException('Could not retrieve items', HttpStatus.NOT_FOUND);
    }
  }

  async findOyunAlItems() {
    // 1. Fetch only the fields we care about + matchedProduct
    const items = await this.itemModel
      .find(
        { category: { $in: [25, 26, 27] }, deleted: { $ne: true } },
        {
          _id: 1,
          name: 1,
          description: 1,
          imageUrl: 1,
          order: 1,
          price: 1,
          category: 1,
          onlinePrice: 1,
          matchedProduct: 1,
        },
      )
      .lean();
    const stocks = await this.accountingService.findAllStocks();
    const inStock = items.filter((item) => {
      if (!item.matchedProduct) {
        return true;
      }
      const totalQty = stocks
        .filter((s) => s.product === item.matchedProduct)
        .reduce((sum, s) => sum + s.quantity, 0);
      return totalQty > 0;
    });
    return inStock;
  }

  async findItemsWithIkasId() {
    return this.itemModel.find({
      ikasId: { $nin: [null, ''] },
      deleted: { $ne: true },
    });
  }

  async updateIkasItemsIkasIdFields(sendItems: MenuItem[]) {
    const items = await this.itemModel.find();
    Promise.all(
      items?.map(async (item) => {
        const ikasItem = sendItems?.find((i) => i._id === item._id);
        if (ikasItem) {
          await this.itemModel.findByIdAndUpdate(item._id, {
            ikasId: ikasItem.ikasId,
          });
        }
      }),
    );
    this.menuGateway.emitItemChanged(null, items);
  }

  async findItemsInCategoryArray(categories: number[]) {
    return this.itemModel.find({
      category: { $in: categories },
      deleted: { $ne: true },
    });
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
      active: true,
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
    if (updates.locations) {
      const items = await this.itemModel.find({ category: id });
      await Promise.all(
        items.map(async (item) => {
          const filteredLocations = item.locations.filter((location) =>
            updates.locations.includes(location),
          );
          await this.itemModel.findByIdAndUpdate(item._id, {
            locations: filteredLocations,
          });
        }),
      );
      this.menuGateway.emitItemChanged(user, items);
    }
    this.menuGateway.emitCategoryChanged(user, category);
    return category;
  }
  async updateFarmCategory(
    user: User,
    id: number,
    updates: UpdateQuery<MenuCategory>,
  ) {
    const category = await this.categoryModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.activityService.addActivity(
      user,
      updates?.active
        ? ActivityType.FARM_BURGER_ACTIVATED
        : ActivityType.FARM_BURGER_DEACTIVATED,
      null,
    );
    const visits = await this.visitService.findByDateAndLocation(
      format(new Date(), 'yyyy-MM-dd'),
      2,
    );
    const uniqueVisitUsers =
      visits
        ?.reduce(
          (acc: { unique: typeof visits; seenUsers: SeenUsers }, visit) => {
            acc.seenUsers = acc.seenUsers || {};
            if (visit?.user && !acc.seenUsers[(visit as any).user]) {
              acc.seenUsers[(visit as any).user] = true;
              acc.unique.push(visit);
            }
            return acc;
          },
          { unique: [], seenUsers: {} },
        )
        ?.unique?.map((visit) => visit.user) ?? [];
    await this.notificationService.createNotification({
      type: updates?.active ? 'INFORMATION' : 'WARNING',
      selectedUsers: (uniqueVisitUsers as any) ?? [],
      selectedLocations: [2],
      seenBy: [],
      event: updates?.active
        ? NotificationEventType.FARMBURGERACTIVATED
        : NotificationEventType.FARMBURGERDEACTIVATED,
      message: `Farm Burger ${updates?.active ? 'activated' : 'deactivated'}`,
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
      throw new HttpException(
        'Problem occured while deleting category',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const category = await this.categoryModel.findByIdAndRemove(id);
    this.menuGateway.emitCategoryChanged(user, category);
    return category;
  }

  async findByIkasId(id: string) {
    const item = await this.itemModel.findOne({
      ikasId: id,
      deleted: { $ne: true },
    });
    return item;
  }
  async findItemById(id: number) {
    const item = await this.itemModel.findById({
      _id: id,
      deleted: { $ne: true },
    });
    return item;
  }

  async getAllIkasItems() {
    const items = await this.itemModel.find({
      ikasId: { $ne: null },
      matchedProduct: { $ne: null },
      deleted: { $ne: true },
    });
    return items;
  }
  async findByMatchedProduct(id: string) {
    const item = await this.itemModel.findOne({
      matchedProduct: id,
      deleted: { $ne: true },
    });
    return item;
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
  async createDamagedItem(
    user: User,
    itemId: number,
    stockQuantity: number,
    price: number,
    category: number,
    name: string,
    oldStockLocation: number,
    newStockLocation: number,
  ) {
    try {
      const item = await this.itemModel.findById(itemId);
      if (!item) {
        throw new HttpException('Item not found', HttpStatus.NOT_FOUND);
      }
      const locations = await this.locationService.findStockLocations();

      let matchedProduct = null;

      // Handling matched product
      if (item.matchedProduct) {
        try {
          const foundProduct = await this.accountingService.findProductById(
            item.matchedProduct,
          );
          const objectFoundProduct = foundProduct.toObject();
          delete objectFoundProduct.matchedMenuItem;
          delete objectFoundProduct._id;
          objectFoundProduct.baseQuantities = locations.map((location) => {
            return {
              location: location._id,
              quantity: 0,
            };
          });
          const foundDamagedProduct =
            await this.accountingService.findProductByName(name);
          if (foundDamagedProduct) {
            matchedProduct = foundDamagedProduct;
          } else {
            matchedProduct = await this.accountingService.createProduct(user, {
              ...(objectFoundProduct as any),
              name: name,
            });
          }
        } catch (error) {
          console.log(error);
          throw new HttpException(
            'Failed to handle matched product',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }
      const objectItem = item.toObject();
      // Deleting old item images
      delete objectItem.imageUrl;
      delete objectItem.productImages;
      delete objectItem.itemProduction;
      delete objectItem.ikasId;
      delete objectItem.priceHistory;
      // Creating a new item
      const newItemData = {
        ...objectItem,
        name,
        category,
        ikasDiscountedPrice: price,
        priceHistory: [{ price: objectItem.price, date: new Date() }],
        ...(matchedProduct && {
          matchedProduct: matchedProduct._id,
          itemProduction: [
            {
              product: matchedProduct._id,
              quantity: 1,
              isDecrementStock: true,
            },
          ],
        }),
      };
      const newItem = await this.itemModel.create(newItemData);
      if (matchedProduct) {
        await this.accountingService.updateItemProduct(
          user,
          matchedProduct._id,
          {
            matchedMenuItem: newItem._id,
          },
        );
      }

      // Handling stock
      if (item.matchedProduct) {
        const foundStock = await this.accountingService.findProductStock(
          item.matchedProduct,
        );
        const foundLocationStock = foundStock.find(
          (stock) => stock.location === oldStockLocation,
        );

        if (foundLocationStock) {
          await this.accountingService.updateStock(
            user,
            foundLocationStock._id,
            {
              product: item.matchedProduct,
              location: oldStockLocation,
              quantity: foundLocationStock.quantity - stockQuantity,
            },
          );
        }
      }
      for (const location of locations) {
        // Creating a new stock for the new product
        await this.accountingService.createStock(user, {
          product: newItem.matchedProduct,
          location: location._id,
          quantity: location._id === newStockLocation ? stockQuantity : 0,
          status: StockHistoryStatusEnum.STOCKENTRY,
        });
      }
      await this.menuGateway.emitItemChanged(user, newItem);
    } catch (error) {
      console.log(error);
      throw new HttpException(
        'Error creating damaged item',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateItem(user: User, id: number, updates: UpdateQuery<MenuItem>) {
    const item = await this.itemModel.findById(id);
    if (!item) {
      throw new HttpException('Item not found', HttpStatus.NOT_FOUND);
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
      updates.priceHistory = this.prunePriceHistory(updates.priceHistory);
      if (item?.ikasId) {
        // Update the price in Ikas service
        try {
          await this.IkasService.updateProductPrice(item.ikasId, updates.price);
        } catch (error) {
          console.error('Error updating price in Ikas:', error);
          throw new HttpException(
            'Failed to update price in Ikas',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }
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
  async updateItemsOrder(user: User, id: number, newOrder: number) {
    const item = await this.itemModel.findById(id);
    if (!item) {
      throw new HttpException('Item not found', HttpStatus.NOT_FOUND);
    }
    await this.itemModel.findByIdAndUpdate(id, { order: newOrder });

    await this.itemModel.updateMany(
      { _id: { $ne: id }, order: { $gte: newOrder } },
      { $inc: { order: 1 } },
    );

    this.menuGateway.emitItemChanged(user, item);
  }
  async updateCategoriesOrder(
    user: User,
    categoryId: number,
    newOrder: number,
  ) {
    const category = await this.categoryModel.findById(categoryId);
    if (!category) {
      throw new HttpException('Category not found', HttpStatus.NOT_FOUND);
    }
    await this.categoryModel.findByIdAndUpdate(categoryId, { order: newOrder });

    await this.categoryModel.updateMany(
      { _id: { $ne: categoryId }, order: { $gte: newOrder } },
      { $inc: { order: 1 } },
    );
    this.menuGateway.emitCategoryChanged(user, category);
  }
  async updateOrderCategoriesOrder(
    user: User,
    categoryId: number,
    newOrder: number,
  ) {
    const category = await this.categoryModel.findById(categoryId);
    if (!category) {
      throw new HttpException('Category not found', HttpStatus.NOT_FOUND);
    }
    await this.categoryModel.findByIdAndUpdate(categoryId, {
      orderCategoryOrder: newOrder,
    });

    await this.categoryModel.updateMany(
      { _id: { $ne: categoryId }, orderCategoryOrder: { $gte: newOrder } },
      { $inc: { orderCategoryOrder: 1 } },
    );
    this.menuGateway.emitCategoryChanged(user, category);
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
          foundItem.ikasId = item.ikasId;
          foundItem.sku = item?.sku;
          foundItem.barcode = item?.barcode;
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
      throw new HttpException('Item not found', HttpStatus.NOT_FOUND);
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
  // this is used for bulk update in menu page
  async updateBulkItems(
    user: User,
    itemIds: number[],
    updates: UpdateQuery<MenuItem>,
  ) {
    const items = await this.itemModel.find({ _id: { $in: itemIds } });
    if (!items.length) {
      throw new HttpException('Items not found', HttpStatus.NOT_FOUND);
    }
    await this.itemModel.updateMany({ _id: { $in: itemIds } }, updates);
    this.menuGateway.emitItemChanged(user, items);
    return items;
  }
  // popular
  async findAllPopular() {
    return this.popularModel
      .find({
        deleted: { $ne: true },
      })
      .sort({ order: 'asc' });
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
    const kitchen = new this.kitchenModel({
      ...createKitchenDto,
      soundRoles: [],
    });
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

  //upper category
  async findAllUpperCategories() {
    return this.upperCategoryModel.find();
  }
  findSingleUpperCategory(id: number) {
    return this.upperCategoryModel.findById(id);
  }

  async createUpperCategory(
    user: User,
    createUpperCategoryDto: CreateUpperCategoryDto,
  ) {
    const upperCategory = await this.upperCategoryModel.create(
      createUpperCategoryDto,
    );
    this.menuGateway.emitUpperCategoryChanged(user, upperCategory);
    return upperCategory;
  }

  async updateUpperCategory(
    user: User,
    id: number,
    updates: UpdateQuery<UpperCategory>,
  ) {
    const upperCategory = await this.upperCategoryModel.findByIdAndUpdate(
      id,
      updates,
      { new: true },
    );
    this.menuGateway.emitUpperCategoryChanged(user, upperCategory);
    return upperCategory;
  }

  async removeUpperCategory(user: User, id: number) {
    const upperCategory = await this.upperCategoryModel.findById(id);
    await upperCategory.remove();
    this.menuGateway.emitUpperCategoryChanged(user, upperCategory);
    return upperCategory;
  }

  // update categories active
  async updateCategoriesActiveness() {
    await this.categoryModel.updateMany({}, { active: true });
    await this.redisService.reset(RedisKeys.MenuItems);
  }
  async findCategoryByName(name: string) {
    return this.categoryModel.findOne({ name: name });
  }

  async findItemByName(name: string) {
    return this.itemModel.findOne({ name: name, deleted: { $ne: true } });
  }
  async createBulkMenuItemWithProduct(createBulkItemDto: CreateBulkItemDto) {
    const lastItem = await this.itemModel.findOne({}).sort({ order: 'desc' });
    const item = new this.itemModel({
      ...createBulkItemDto,
      order: lastItem ? lastItem.order + 1 : 1,
      locations: [1, 2],
      itemPriceHistory: [
        {
          price: createBulkItemDto.price,
          date: format(new Date(), 'yyyy-MM-dd'),
        },
      ],
    });
    await item.save();
    return item;
  }

  async updateForBulkItem(id: number, product: string) {
    await this.itemModel.findByIdAndUpdate(
      id,
      {
        matchedProduct: product,
        itemProduction: [
          {
            quantity: 1,
            product: product,
            isDecrementStock: true,
          },
        ],
      },
      { new: true },
    );
  }
  deleteMenuItem(id: number) {
    return this.itemModel.findByIdAndDelete(id);
  }
  async updateItemIkasCategories() {
    try {
      const ikasProducts = await this.IkasService.getAllProducts();
      const ikasItems = await this.getAllIkasItems();
      const ikasCategories =
        await this.accountingService.findAllProductCategory();

      for (const ikasItem of ikasItems) {
        const ikasProduct = ikasProducts.find(
          (product) => product.id === ikasItem.ikasId,
        );

        if (!ikasProduct) {
          console.warn(
            `No matching product found for IkasItem ID: ${ikasItem.ikasId}`,
          );
          continue; // Skip this iteration if no matching product is found
        }

        const foundCategories = ikasCategories.filter((category) =>
          ikasProduct.categoryIds.includes(category.ikasId),
        );

        if (foundCategories.length > 0) {
          await this.itemModel.findByIdAndUpdate(
            ikasItem._id,
            {
              productCategories: foundCategories.map(
                (category) => category._id,
              ),
            },
            { new: true },
          );
        }
      }

      this.menuGateway.emitItemChanged();
    } catch (error) {
      console.error('Failed to update Ikas categories:', error);
      throw error;
    }
  }

  async createMultipleIkasProduct(user: User, itemIds: Array<number>) {
    const items = await this.itemModel.find({
      _id: { $in: itemIds },
    });
    let failedItems = [];
    const ikasCategories =
      await this.accountingService.findAllProductCategory();
    for (const item of items) {
      try {
        const ikasCategoryIds = item?.productCategories
          ?.map((catId) => ikasCategories.find((c) => c._id === catId)?.ikasId)
          ?.filter((ikasId) => ikasId !== undefined); // Ensure undefined values are filtered out
        item.productCategories = ikasCategoryIds;
        await this.IkasService.createItemProduct(user, item);
      } catch (error) {
        console.error(
          'Failed to create Ikas product for item ID ' + item._id + ':',
          error,
        );
        failedItems.push(item._id);
      }
    }
    if (failedItems.length > 0) {
      console.log('Items that failed to create:', failedItems);
    }
    return failedItems;
  }
  async removeDeletedProductsFromMenuItem() {
    const products = await this.accountingService.findDeletedProducts();
    const deletedProductIds = new Set(products.map((product) => product._id));
    const items = await this.itemModel.find();
    const updates = [];
    for (const item of items) {
      if (item.matchedProduct && deletedProductIds.has(item.matchedProduct)) {
        item.matchedProduct = undefined;
        updates.push(item.save());
      }
      if (item.itemProduction?.length > 0) {
        const filteredItemProduction = item.itemProduction.filter(
          (itemProductionItem) =>
            !deletedProductIds.has(itemProductionItem.product),
        );
        if (filteredItemProduction.length !== item.itemProduction.length) {
          item.itemProduction = filteredItemProduction;
          updates.push(item.save());
        }
      }
    }
    await Promise.all(updates);
    this.menuGateway.emitItemChanged();
  }

  async updateItemsSlugs() {
    const items = await this.getAllIkasItems();
    const ikasProducts = await this.IkasService.getAllProducts();
    const updatePromises = items.map((item) => {
      const ikasProduct = ikasProducts.find(
        (product) => product.id === item.ikasId,
      );

      if (!ikasProduct) {
        console.log(
          `No matching product found for IkasItem ID: ${item.ikasId}`,
        );
        return null;
      }
      return this.itemModel.findByIdAndUpdate(item._id, {
        slug: ikasProduct.metaData.slug,
      });
    });
    await Promise.all(updatePromises.filter(Boolean));
    this.menuGateway.emitItemChanged();
    return items;
  }
  async setOrderCategoryOrders() {
    const categories = await this.categoryModel.find();
    let i = 1;
    categories.forEach(async (category, index) => {
      await this.categoryModel.findByIdAndUpdate(category._id, {
        orderCategoryOrder: i,
      });
      i++;
    });
    this.menuGateway.emitCategoryChanged(null, categories);
    return categories;
  }
  prunePriceHistory(history: PriceHistory[]): PriceHistory[] {
    return history.filter((entry, idx) => {
      if (idx === 0) return true;
      return entry.price !== history[idx - 1].price;
    });
  }
  async removeDublicatesPriceHistory() {
    const items = await this.itemModel.find();
    items.forEach(async (item) => {
      if (item.priceHistory && item.priceHistory.length > 0) {
        const uniquePriceHistory = this.prunePriceHistory(item.priceHistory);
        if (uniquePriceHistory.length !== item.priceHistory.length) {
          await this.itemModel.findByIdAndUpdate(item._id, {
            priceHistory: uniquePriceHistory,
          });
        }
      }
    });
    this.menuGateway.emitItemChanged(null, items);
  }
}
