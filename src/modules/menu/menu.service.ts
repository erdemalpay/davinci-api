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
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
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
  CreateUpperCategoryDto
} from './menu.dto';
import { Popular } from './popular.schema';
import { UpperCategory } from './upperCategory.schema';

export class MenuService {
  constructor(
    @InjectModel(MenuCategory.name)
    private categoryModel: Model<MenuCategory>,
    @InjectModel(MenuItem.name) private itemModel: Model<MenuItem>,
    @InjectModel(Popular.name) private popularModel: Model<Popular>,
    @InjectModel(Kitchen.name) private kitchenModel: Model<Kitchen>,
    @InjectModel(UpperCategory.name)
    private upperCategoryModel: Model<UpperCategory>,
    private readonly websocketGateway: AppWebSocketGateway,
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

  async findAllCategories() {
    try {
      // Attempt to retrieve categories from Redis cache
      const redisCategories = await this.redisService.get(
        RedisKeys.MenuCategories,
      );
      if (redisCategories) {
        return redisCategories; // Return cached categories if available
      }
    } catch (error) {
      console.error('Failed to retrieve categories from Redis:', error);
    }

    try {
      const allCategories = await this.categoryModel
        .find()
        .sort({ order: 'asc' })
        .exec();

      // If categories are found, cache them in Redis
      if (allCategories.length > 0) {
        await this.redisService.set(RedisKeys.MenuCategories, allCategories);
      }
      return allCategories; // Return categories from the database
    } catch (error) {
      console.error('Failed to retrieve categories from database:', error);
      throw new HttpException(
        'Could not retrieve categories',
        HttpStatus.NOT_FOUND,
      );
    }
  }
  async openItemLocation(itemId: number, locationId: number) {
    const item = await this.itemModel.findByIdAndUpdate(itemId, {
      $push: { locations: locationId },
    });
    if (!item) {
      throw new HttpException('Item not found', HttpStatus.NOT_FOUND);
    }
    this.websocketGateway.emitItemChanged();
    return item;
  }
  async closeItemLocation(itemId: number, locationId: number) {
    const item = await this.itemModel.findByIdAndUpdate(itemId, {
      $pull: { locations: locationId },
    });
    if (!item) {
      throw new HttpException('Item not found', HttpStatus.NOT_FOUND);
    }
    this.websocketGateway.emitItemChanged();
    return item;
  }
  async findActiveCategories() {
    try {
      // Attempt to retrieve active categories from Redis cache
      const redisActiveCategories = await this.redisService.get(
        RedisKeys.ActiveMenuCategories,
      );
      if (redisActiveCategories) {
        return redisActiveCategories; // Return cached active categories if available
      }
    } catch (error) {
      console.error('Failed to retrieve active categories from Redis:', error);
    }

    try {
      const activeCategories = await this.categoryModel
        .find({ active: true })
        .sort({ order: 'asc' })
        .exec();

      // If active categories are found, cache them in Redis
      if (activeCategories.length > 0) {
        await this.redisService.set(
          RedisKeys.ActiveMenuCategories,
          activeCategories,
        );
      }
      return activeCategories; // Return active categories from the database
    } catch (error) {
      console.error(
        'Failed to retrieve active categories from database:',
        error,
      );
      throw new HttpException(
        'Could not retrieve active categories',
        HttpStatus.NOT_FOUND,
      );
    }
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
    this.websocketGateway.emitItemChanged();
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
    this.websocketGateway.emitItemChanged();
  }
  async createCategory(createCategoryDto: CreateCategoryDto) {
    const lastCategory = await this.categoryModel
      .findOne({})
      .sort({ order: 'desc' });
    const category = await this.categoryModel.create({
      ...createCategoryDto,
      order: lastCategory ? lastCategory.order + 1 : 1,
      orderCategoryOrder: lastCategory ? lastCategory.order + 1 : 1,
      locations: [1, 2],
      active: true,
    });
    if (createCategoryDto?.isKitchenMenu) {
      const orderDataPage = await this.panelControlService.getPage(
        'order_datas',
      );
      if (!orderDataPage.tabs.find((tab) => tab.name === category.name)) {
        orderDataPage.tabs.push({
          name: category.name,
          permissionsRoles: [1],
        });
        await orderDataPage.save();
      }
    }
    this.websocketGateway.emitCategoryChanged();
    return category;
  }

  async updateCategory(id: number, updates: UpdateQuery<MenuCategory>) {
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

      this.websocketGateway.emitItemChanged();
    }
    if (updates.isKitchenMenu) {
      const ordersPage = await this.panelControlService.getPage('orders');
      const orderDataPage = await this.panelControlService.getPage(
        'order_datas',
      );
      if (!orderDataPage.tabs.find((tab) => tab.name === category.name)) {
        orderDataPage.tabs.push({
          name: category.name,
          permissionsRoles: [1],
        });
        if (
          !ordersPage.tabs.find(
            (tab) => tab.name === category.name + ' ' + 'Menu',
          )
        ) {
          ordersPage.tabs.push({
            name: category.name + ' ' + 'Menu',
            permissionsRoles: [1],
          });
          Promise.all([await ordersPage.save(), await orderDataPage.save()]);
        }
      }
      if (updates?.kitchen) {
      }
    }

    // Sync menu items with current stock when disableWhenOutOfStock is enabled
    if (updates.disableWhenOutOfStock === true) {
      const items = await this.itemModel.find({ category: id });
      const locations = await this.locationService.findAllLocations();

      await Promise.all(
        items.map(async (item) => {
          if (item.matchedProduct) {
            const stocks = await this.accountingService.findProductStock(
              item.matchedProduct,
            );

            for (const location of locations) {
              // Only process if category is available in this location
              if (!category.locations.includes(location._id)) {
                continue;
              }

              const stock = stocks.find((s) => s.location === location._id);
              const isItemInLocation = item.locations.includes(location._id);

              if (stock && stock.quantity <= 0 && isItemInLocation) {
                if (
                  await this.accountingService.shouldCloseItemOnStockOut(
                    item.matchedProduct,
                    location._id,
                    stocks,
                  )
                ) {

                  await this.closeItemLocation(item._id, location._id);
                }
              } else if (stock && stock.quantity > 0 && !isItemInLocation) {

                await this.openItemLocation(item._id, location._id);
              }
            }
          }
        }),
      );
    }

    this.websocketGateway.emitCategoryChanged();
    return category;
  }
  async updateKitchenCategory(
    user: User,
    id: number,
    updates: UpdateQuery<MenuCategory>,
  ) {
    const category = await this.categoryModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    const statusKey = updates?.active
      ? 'Status.Activated'
      : 'Status.Deactivated';
    const message = {
      key: 'BrandActivationStatus',
      params: {
        brand: category.name,
        status: statusKey,
      },
    };
    const notificationEvents =
      await this.notificationService.findAllEventNotifications();

    const eventType = updates?.active
      ? NotificationEventType.KITCHENACTIVATED
      : NotificationEventType.KITCHENDEACTIVATED;

    const kitchenEvent = notificationEvents.find(
      (notification) => notification.event === eventType,
    );
    if (kitchenEvent) {
      await this.notificationService.createNotification({
        type: kitchenEvent.type,
        createdBy: kitchenEvent.createdBy,
        selectedUsers: kitchenEvent.selectedUsers,
        selectedLocations: kitchenEvent.selectedLocations,
        selectedRoles: kitchenEvent.selectedRoles,
        seenBy: [],
        event: eventType,
        message,
      });
    }
    this.websocketGateway.emitCategoryChanged();
    return category;
  }
  async removeCategory(id: number) {
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
    this.websocketGateway.emitCategoryChanged();
    return category;
  }

  async findByIkasId(id: string) {
    const item = await this.itemModel.findOne({
      ikasId: id,
      deleted: { $ne: true },
    });
    return item;
  }

  async findByShopifyId(id: string) {
    const item = await this.itemModel.findOne({
      shopifyId: id,
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

  async findCategoryById(id: number) {
    return this.categoryModel.findById(id);
  }

  async getAllIkasItems() {
    const items = await this.itemModel.find({
      ikasId: { $nin: [null, ''] },
      matchedProduct: { $nin: [null, ''] },
      deleted: { $ne: true },
    });
    return items;
  }

  async getAllShopifyItems() {
    const items = await this.itemModel.find({
      shopifyId: { $nin: [null, ''] },
      matchedProduct: { $nin: [null, ''] },
      deleted: { $ne: true },
    });
    return items;
  }

  /**
   * Updates ikasVariantId for all menu items that have ikasId
   * Fetches all products once from Ikas API, then finds variants for each item
   * Skips items that already have ikasVariantId
   * @returns Object with success count, failed count, and details
   */
  async updateIkasVariantIds() {
    // Get only items that have ikasId but don't have ikasVariantId yet
    const items = await this.itemModel.find({
      ikasId: { $nin: [null, ''] },
      $or: [
        { ikasVariantId: { $exists: false } },
        { ikasVariantId: null },
        { ikasVariantId: '' },
      ],
      deleted: { $ne: true },
    });

    const results = {
      total: items.length,
      skipped: 0,
      success: 0,
      failed: 0,
      details: [] as Array<{
        itemId: number;
        itemName: string;
        ikasId: string;
        status: 'success' | 'failed' | 'skipped';
        variantId?: string;
        error?: string;
      }>,
    };

    if (items.length === 0) {
      return {
        ...results,
        message: 'No items to update. All items already have ikasVariantId.',
      };
    }

    // Fetch all products once from Ikas API
    let allProducts: any[] = [];
    try {
      allProducts = await this.IkasService.getAllProducts();
    } catch (error) {
      // If getAllProducts fails, mark all items as failed
      for (const item of items) {
        results.details.push({
          itemId: item._id,
          itemName: item.name,
          ikasId: item.ikasId || '',
          status: 'failed',
          error: `Failed to fetch products from Ikas: ${
            error?.message || 'Unknown error'
          }`,
        });
        results.failed++;
      }
      return results;
    }

    // Process each item
    for (const item of items) {
      try {
        if (!item.ikasId) {
          results.details.push({
            itemId: item._id,
            itemName: item.name,
            ikasId: item.ikasId || '',
            status: 'failed',
            error: 'No ikasId found',
          });
          results.failed++;
          continue;
        }

        // Skip if already has ikasVariantId (shouldn't happen due to query, but double-check)
        if (item.ikasVariantId) {
          results.details.push({
            itemId: item._id,
            itemName: item.name,
            ikasId: item.ikasId,
            status: 'skipped',
            variantId: item.ikasVariantId,
          });
          results.skipped++;
          continue;
        }

        // Find product in the fetched list
        const product = allProducts.find((p) => p?.id === item.ikasId);

        if (!product || !product.variants || product.variants.length === 0) {
          results.details.push({
            itemId: item._id,
            itemName: item.name,
            ikasId: item.ikasId,
            status: 'failed',
            error: 'Product not found or has no variants',
          });
          results.failed++;
          continue;
        }

        const variantId = product.variants[0].id;

        // Update the item with variant ID
        await this.itemModel.findByIdAndUpdate(item._id, {
          ikasVariantId: variantId,
        });

        results.details.push({
          itemId: item._id,
          itemName: item.name,
          ikasId: item.ikasId,
          status: 'success',
          variantId: variantId,
        });
        results.success++;
      } catch (error) {
        results.details.push({
          itemId: item._id,
          itemName: item.name,
          ikasId: item.ikasId || '',
          status: 'failed',
          error: error?.message || 'Unknown error',
        });
        results.failed++;
        console.error(
          `Error updating variant ID for item ${item._id} (${item.name}):`,
          error,
        );
      }
    }

    return results;
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
      const deletedItem = await this.itemModel.findOne({
        deleted: true,
        name: createItemDto.name,
      });
      if (deletedItem) {
        await this.itemModel.findByIdAndUpdate(deletedItem._id, {
          ...createItemDto,
          matchedProduct: null,
          deleted: false,
        });
        await this.websocketGateway.emitItemChanged();
        return deletedItem;
      }
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
      this.websocketGateway.emitItemChanged();
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
      await this.websocketGateway.emitItemChanged();
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
    const priceChanged =
      updates.hasOwnProperty('price') && item.price !== updates.price;
    const onlinePriceChanged =
      updates.hasOwnProperty('onlinePrice') &&
      item.onlinePrice !== updates.onlinePrice;

    if (priceChanged) {
      updates.priceHistory = [
        ...item.priceHistory,
        { price: updates.price, date: new Date().toISOString() },
      ];
      updates.priceHistory = this.prunePriceHistory(updates.priceHistory);
    }

    if ((priceChanged || onlinePriceChanged) && item?.ikasId) {
      const ikasProducts = await this.IkasService.getAllProducts();

      console.log('Updating price in Ikas for item:', item._id);
      try {
        const basePrice = updates.hasOwnProperty('price')
          ? updates.price
          : item.price;
        const onlinePrice = updates.hasOwnProperty('onlinePrice')
          ? updates.onlinePrice
          : item.onlinePrice ?? null;
        await this.IkasService.updateVariantPrices(
          ikasProducts,
          item.ikasId,
          basePrice,
          onlinePrice,
          updates.ikasDiscountedPrice ?? item.ikasDiscountedPrice ?? null,
          null,
          'TRY',
        );
      } catch (error) {
        throw new HttpException(
          'Failed to update price in Ikas',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
    const updatedItem = await this.itemModel.findByIdAndUpdate(
      id,
      {
        ...updates,
        suggestedDiscount: updates.suggestedDiscount ?? null,
      },
      {
        new: true,
      },
    );
    this.activityService.addUpdateActivity(
      user,
      ActivityType.UPDATE_MENU_ITEM,
      item,
      updatedItem,
    );
    this.websocketGateway.emitItemChanged();
    return updatedItem;
  }
  async syncAllIkasPrices(currency = 'TRY') {
    if (process.env.NODE_ENV !== 'production') return;

    const items = await this.itemModel.find(
      { ikasId: { $exists: true, $ne: null } },
      {
        ikasId: 1,
        price: 1,
        onlinePrice: 1,
        ikasDiscountedPrice: 1,
      },
    );

    const payload = items.map((it) => ({
      productId: it.ikasId,
      basePrice: it.price ?? null,
      onlinePrice: it.onlinePrice ?? null,
    }));
    await this.IkasService.bulkUpdatePricesForProducts(payload, currency);
  }
  async updateItemsOrder(id: number, newOrder: number) {
    const item = await this.itemModel.findById(id);
    if (!item) {
      throw new HttpException('Item not found', HttpStatus.NOT_FOUND);
    }
    await this.itemModel.findByIdAndUpdate(id, { order: newOrder });

    await this.itemModel.updateMany(
      { _id: { $ne: id }, order: { $gte: newOrder } },
      { $inc: { order: 1 } },
    );
    this.websocketGateway.emitItemChanged();
  }
  async updateCategoriesOrder(categoryId: number, newOrder: number) {
    const category = await this.categoryModel.findById(categoryId);
    if (!category) {
      throw new HttpException('Category not found', HttpStatus.NOT_FOUND);
    }
    await this.categoryModel.findByIdAndUpdate(categoryId, { order: newOrder });

    await this.categoryModel.updateMany(
      { _id: { $ne: categoryId }, order: { $gte: newOrder } },
      { $inc: { order: 1 } },
    );
    this.websocketGateway.emitCategoryChanged();
  }
  async updateOrderCategoriesOrder(categoryId: number, newOrder: number) {
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
    this.websocketGateway.emitCategoryChanged();
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
      await this.syncAllIkasPrices('TRY');

      this.websocketGateway.emitItemChanged();
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
    this.websocketGateway.emitItemChanged();
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
    this.websocketGateway.emitItemChanged();
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
    this.websocketGateway.emitItemChanged();
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

  async createPopular(createPopularDto: CreatePopularDto) {
    const popularItems = await this.popularModel.find().populate('item');
    const lastItem = popularItems[popularItems?.length - 1];

    const popularItem = await this.popularModel.create({
      ...createPopularDto,
      order: lastItem ? lastItem.order + 1 : 1,
    });
    this.websocketGateway.emitPopularChanged();
    return popularItem;
  }

  async removePopular(id: number) {
    const popularItem = await this.popularModel.findOneAndDelete({ item: id });
    this.websocketGateway.emitPopularChanged();
    return popularItem;
  }
  async updatePopular(id: number, updates: UpdateQuery<Popular>) {
    const popularItem = await this.popularModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.websocketGateway.emitPopularChanged();
    return popularItem;
  }

  async updateMenuItemProduct(stayedProduct: string, removedProduct: string) {
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
    this.websocketGateway.emitItemChanged();
  }
  // kitchen
  async findAllKitchens() {
    try {
      const redisKitchens = await this.redisService.get(RedisKeys.Kitchens);
      if (redisKitchens) {
        return redisKitchens;
      }
    } catch (error) {
      console.error('Failed to retrieve kitchens from Redis:', error);
    }

    try {
      const kitchens = await this.kitchenModel.find().exec();

      if (kitchens.length > 0) {
        await this.redisService.set(RedisKeys.Kitchens, kitchens);
      }
      return kitchens;
    } catch (error) {
      console.error('Failed to retrieve kitchens from database:', error);
      throw new HttpException(
        'Could not retrieve kitchens',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async createKitchen(createKitchenDto: CreateKitchenDto) {
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
    this.websocketGateway.emitKitchenChanged();
    return kitchen;
  }
  async updateKitchen(id: string, updates: UpdateQuery<Kitchen>) {
    const kitchen = await this.kitchenModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.websocketGateway.emitKitchenChanged();
    return kitchen;
  }
  async removeKitchen(id: string) {
    const kitchen = await this.kitchenModel.findById(id);
    const ordersPage = await this.panelControlService.getPage('orders');
    ordersPage.tabs = ordersPage.tabs.filter(
      (tab) => tab.name !== kitchen.name,
    );
    await kitchen.remove();
    this.websocketGateway.emitKitchenChanged();
    return kitchen;
  }

  //upper category
  async findAllUpperCategories() {
    return this.upperCategoryModel.find();
  }
  findSingleUpperCategory(id: number) {
    return this.upperCategoryModel.findById(id);
  }

  async createUpperCategory(createUpperCategoryDto: CreateUpperCategoryDto) {
    const upperCategory = await this.upperCategoryModel.create(
      createUpperCategoryDto,
    );
    this.websocketGateway.emitUpperCategoryChanged();
    return upperCategory;
  }

  async updateUpperCategory(id: number, updates: UpdateQuery<UpperCategory>) {
    const upperCategory = await this.upperCategoryModel.findByIdAndUpdate(
      id,
      updates,
      { new: true },
    );
    this.websocketGateway.emitUpperCategoryChanged();
    return upperCategory;
  }

  async removeUpperCategory(id: number) {
    const upperCategory = await this.upperCategoryModel.findById(id);
    await upperCategory.remove();
    this.websocketGateway.emitUpperCategoryChanged();
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

      this.websocketGateway.emitItemChanged();
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
    this.websocketGateway.emitItemChanged();
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
    this.websocketGateway.emitItemChanged();
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
    this.websocketGateway.emitCategoryChanged();
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
    this.websocketGateway.emitItemChanged();
  }
  async migrateSuggestedDiscounts(): Promise<{ modifiedCount: number }> {
    const res = await this.itemModel.updateMany({}, [
      {
        $set: {
          suggestedDiscount: {
            $switch: {
              branches: [
                {
                  case: { $eq: [{ $type: '$suggestedDiscount' }, 'array'] },
                  then: '$suggestedDiscount',
                },
                {
                  case: {
                    $or: [
                      { $eq: [{ $type: '$suggestedDiscount' }, 'missing'] },
                      { $eq: ['$suggestedDiscount', null] },
                    ],
                  },
                  then: [],
                },
              ],
              default: ['$suggestedDiscount'],
            },
          },
        },
      },
    ]);

    return {
      modifiedCount: (res as any).modifiedCount ?? (res as any).nModified ?? 0,
    };
  }

  async updateProductVisibilityAfterStockChange(
    productId: string,
    changedLocationId: number,
  ) {
    const menuItem = await this.findByMatchedProduct(productId);
    if (!menuItem) {
      return;
    }

    const category = await this.findCategoryById(menuItem.category as number);
    if (!category?.disableWhenOutOfStock) {
      return;
    }

    const allLocations = await this.locationService.findAllLocations();
    const affectedLocations = allLocations.filter(
      (loc) =>
        loc._id === changedLocationId ||
        loc.fallbackStockLocation === changedLocationId,
    );

    for (const location of affectedLocations) {
      const primaryStocks =
        await this.accountingService.findProductStockByLocation(
          productId,
          location._id,
        );
      let totalStock = primaryStocks.reduce((sum, s) => sum + s.quantity, 0);

      if (location.fallbackStockLocation) {
        const fallbackStocks =
          await this.accountingService.findProductStockByLocation(
            productId,
            location.fallbackStockLocation,
          );
        totalStock += fallbackStocks.reduce((sum, s) => sum + s.quantity, 0);
      }

      if (totalStock > 0) {
        await this.openItemLocation(menuItem._id, location._id);
      } else {
        await this.closeItemLocation(menuItem._id, location._id);
      }
    }
  }
}
