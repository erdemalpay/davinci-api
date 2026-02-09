import { InjectQueue } from '@nestjs/bull';
import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bull';
import { format, parseISO } from 'date-fns';
import * as moment from 'moment-timezone';
import {
  ClientSession,
  Connection,
  Model,
  PipelineStage,
  UpdateQuery,
} from 'mongoose';
import { pick } from 'src/utils/tsUtils';
import { withSession } from 'src/utils/withSession';
import { StockHistoryStatusEnum } from '../accounting/accounting.dto';
import { ButtonCallService } from '../buttonCall/buttonCall.service';
import { GameplayService } from '../gameplay/gameplay.service';
import { LocationService } from '../location/location.service';
import { Kitchen } from '../menu/kitchen.schema';
import { NotificationEventType } from '../notification/notification.dto';
import { NotificationService } from '../notification/notification.service';
import { PointService } from '../point/point.service';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { TableTypes } from '../table/table.dto';
import { Table } from '../table/table.schema';
import { TableService } from '../table/table.service';
import { User } from '../user/user.schema';
import { UserService } from '../user/user.service';
import { VisitService } from '../visit/visit.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { AccountingService } from './../accounting/accounting.service';
import { ActivityType } from './../activity/activity.dto';
import { ActivityService } from './../activity/activity.service';
import { MenuService } from './../menu/menu.service';
import { ShopifyService } from './../shopify/shopify.service';
import { Collection } from './collection.schema';
import { Discount } from './discount.schema';
import {
  CollectionQueryDto,
  CreateCollectionDto,
  CreateDiscountDto,
  CreateOrderDto,
  CreateOrderNotesDto,
  OrderCollectionStatus,
  OrderQueryDto,
  OrderStatus,
  SummaryCollectionQueryDto,
} from './order.dto';
import { Order } from './order.schema';
import { OrderGroup } from './orderGroup.schema';
import { OrderNotes } from './orderNotes.schema';
interface SeenUsers {
  [key: string]: boolean;
}

interface PopulatedMenuItem {
  _id: number;
  name: string;
  category: number;
  itemProduction: Array<{
    quantity: number;
    product: string;
    isDecrementStock: boolean;
  }>;
}

interface PopulatedOrder {
  _id: number;
  item: PopulatedMenuItem;
  kitchen?: Kitchen;
  quantity: number;
  unitPrice: number;
  location: number;
  stockLocation?: number;
  discount?: number;
  discountPercentage?: number;
  discountAmount?: number;
  paidQuantity: number;
  status: OrderStatus;
  createdBy: number;
  createdAt: Date;
  table?: number | PopulatedTable;
}

interface PopulatedTable {
  _id: number;
  date: string;
  name?: string;
  isOnlineSale?: boolean;
  finishHour?: string;
  type?: string;
  startHour?: string;
}

interface OrderDocument {
  _id: number;
  item?: number;
  [key: string]: unknown;
}

interface PaidOrderItem {
  order: number;
  paidQuantity: number;
}

// Type guard helpers
function isPopulatedMenuItem(
  item: number | PopulatedMenuItem,
): item is PopulatedMenuItem {
  return typeof item === 'object' && item !== null && 'itemProduction' in item;
}

function isPopulatedTable(
  table: number | PopulatedTable,
): table is PopulatedTable {
  return typeof table === 'object' && table !== null && 'date' in table;
}

function isPopulatedKitchen(kitchen: string | Kitchen): kitchen is Kitchen {
  return typeof kitchen === 'object' && kitchen !== null && 'name' in kitchen;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectQueue('order-confirmation')
    private confirmationQueue: Queue,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(OrderNotes.name) private orderNotesModel: Model<OrderNotes>,
    @InjectModel(Collection.name) private collectionModel: Model<Collection>,
    @InjectModel(Discount.name) private discountModel: Model<Discount>,
    @InjectModel(OrderGroup.name) private orderGroupModel: Model<OrderGroup>,
    @Inject(forwardRef(() => TableService))
    private readonly tableService: TableService,
    @Inject(forwardRef(() => MenuService))
    private readonly menuService: MenuService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly activityService: ActivityService,
    private readonly accountingService: AccountingService,
    private readonly visitService: VisitService,
    private readonly redisService: RedisService,
    private readonly notificationService: NotificationService,
    private readonly buttonCallService: ButtonCallService,
    private readonly locationService: LocationService,

    @Inject(forwardRef(() => GameplayService))
    private readonly gameplayService: GameplayService,

    @Inject(forwardRef(() => PointService))
    private readonly pointService: PointService,

    @Inject(forwardRef(() => ShopifyService))
    private readonly shopifyService: ShopifyService,
  ) {}
  // Orders
  async findAllOrders() {
    try {
      const orders = await this.orderModel
        .find()
        .populate(
          'table',
          'date _id name isOnlineSale finishHour type startHour',
        )
        .exec();
      return orders;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findActiveOrdersByIds(orderIds: number[]) {
    try {
      if (!orderIds || orderIds.length === 0) {
        return [];
      }
      const orders = await this.orderModel.find({
        _id: { $in: orderIds },
        status: { $ne: OrderStatus.CANCELLED },
      });
      return orders;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch orders by IDs',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async findPopularDiscounts() {
    const cacheKey = RedisKeys.PopularDiscounts;
    const today = new Date().toISOString().split('T')[0]; // e.g. "2025-05-30"

    // Try cache
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached?.date === today) {
        return cached.data;
      }
    } catch (err) {
      this.logger.warn('Could not read popular discounts from Redis:', err);
    }
    // Not cached
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    let orders: Array<{ item: number; discount?: number }>;
    try {
      orders = await this.orderModel
        .find({
          createdAt: { $gte: thirtyDaysAgo },
          discount: { $exists: true, $ne: null },
        })
        .select('item discount')
        .lean();
    } catch (err) {
      throw new HttpException(
        'Failed to load orders for popular discounts',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    // Build map of item → Set of discounts
    const map = new Map<number, Set<number>>();
    for (const { item, discount } of orders) {
      if (discount == null) continue;
      if (!map.has(item)) {
        map.set(item, new Set());
      }
      map.get(item)!.add(discount);
    }
    // Convert to array of { item, discounts[] }, sorting IDs descending
    const result = Array.from(map.entries()).map(([item, discountsSet]) => {
      const discounts = Array.from(discountsSet).sort((a, b) => b - a);
      return { item, discounts };
    });

    // Cache in Redis (with today's date)
    try {
      await this.redisService.set(cacheKey, { date: today, data: result });
      // Optionally set an expiry, e.g. 24h:
      // await this.redisService.expire(cacheKey, 60 * 60 * 24);
    } catch (err) {
      this.logger.warn('Could not write popular discounts to Redis:', err);
    }

    return result;
  }
  async findQueryOrders(query: OrderQueryDto) {
    const filterQuery: Record<string, unknown> = {
      quantity: { $gt: 0 },
    };
    const {
      after,
      before,
      category,
      location,
      isIkasPickUp,
      isShopifyPickUp,
      item,
    } = query;
    const IST_OFFSET_MS = 3 * 60 * 60 * 1000;
    if (after) {
      let startUtc: Date;
      if (/^\d{4}-\d{2}-\d{2}$/.test(after)) {
        const [y, m, d] = after.split('-').map(Number);
        const istStart = new Date(y, m - 1, d, 0, 0, 0, 0);
        startUtc = new Date(istStart.getTime() - IST_OFFSET_MS);
      } else {
        const dt = new Date(after);
        startUtc = new Date(dt.getTime() - IST_OFFSET_MS);
      }
      filterQuery.tableDate = { $gte: startUtc };
    }

    if (before) {
      let endUtc: Date;
      if (/^\d{4}-\d{2}-\d{2}$/.test(before)) {
        const [y, m, d] = before.split('-').map(Number);
        const istEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
        endUtc = new Date(istEnd.getTime() - IST_OFFSET_MS);
      } else {
        const dt = new Date(before);
        endUtc = new Date(dt.getTime() - IST_OFFSET_MS);
      }
      filterQuery.tableDate = {
        ...(typeof filterQuery.tableDate === 'object' &&
        filterQuery.tableDate !== null
          ? filterQuery.tableDate
          : {}),
        $lte: endUtc,
      };
    }
    const filterKeys = [
      'createdBy',
      'preparedBy',
      'deliveredBy',
      'cancelledBy',
      'status',
    ];
    if (location) {
      const locationArray = location
        .split(',')
        .map((item) => item.trim())
        .map(Number);
      filterQuery['location'] = { $in: locationArray };
    }
    if (query.discount) {
      const discountArray = query.discount
        .split(',')
        .map((item) => item.trim())
        .map(Number);
      filterQuery['discount'] = { $in: discountArray };
    }
    if (item !== undefined) {
      filterQuery['item'] = Number(item);
    }
    filterKeys.forEach((key) => {
      if (query[key]) {
        filterQuery[key] = query[key];
      }
    });

    if (isIkasPickUp) {
      filterQuery['status'] = { $ne: OrderStatus.CANCELLED };
      filterQuery['ikasCustomer'] = { $exists: true };
    }
    if (isShopifyPickUp) {
      filterQuery['status'] = { $ne: OrderStatus.CANCELLED };
      filterQuery['shopifyCustomer'] = { $exists: true };
    }

    try {
      let itemIds = [];
      if (category) {
        const categoryArray = category
          .split(',')
          .map((item) => item.trim())
          .map(Number);
        const items = await this.menuService.findItemsInCategoryArray(
          categoryArray,
        );
        itemIds = items.map((item) => item._id);
      }
      const orderFilterQuery = {
        ...filterQuery,
        ...(itemIds.length > 0 ? { item: { $in: itemIds } } : {}),
      };
      const orders = await this.orderModel
        .find(orderFilterQuery)
        .populate(
          'table',
          'date _id name isOnlineSale finishHour type startHour',
        )
        .sort({ createdAt: -1 })
        .exec();

      return orders;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  parseLocalDate(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  async findPersonalCollectionNumbers(query: OrderQueryDto) {
    const filterQuery: Record<string, unknown> = {};
    const { after, before } = query;
    const dateFilter: { $gte?: Date; $lte?: Date } = {};
    if (after) {
      const start = this.parseLocalDate(after);
      dateFilter.$gte = start;
    }
    if (before) {
      const end = this.parseLocalDate(before);
      end.setHours(23, 59, 59, 999);
      dateFilter.$lte = end;
    }

    if (Object.keys(dateFilter).length) {
      filterQuery.createdAt = dateFilter;
    }
    filterQuery['status'] = { $ne: OrderCollectionStatus.CANCELLED };
    try {
      const pipeline = [
        { $match: filterQuery },
        {
          $group: {
            _id: '$createdBy',
            totalCollections: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            createdBy: '$_id',
            totalCollections: 1,
          },
        },
      ];
      const results = await this.collectionModel.aggregate(pipeline).exec();
      return results;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch personal collection numbers',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findPersonalDatas(query: OrderQueryDto) {
    const filterQuery: Record<string, unknown> = {};
    const { after, before, eliminatedDiscounts } = query;
    const dateFilter: { $gte?: Date; $lte?: Date } = {};
    if (after) {
      const start = this.parseLocalDate(after);
      dateFilter.$gte = start;
    }
    if (before) {
      const end = this.parseLocalDate(before);
      end.setHours(23, 59, 59, 999);
      dateFilter.$lte = end;
    }

    if (Object.keys(dateFilter).length) {
      filterQuery.createdAt = dateFilter;
    }
    if (eliminatedDiscounts) {
      const discountArray = eliminatedDiscounts
        ? eliminatedDiscounts.split(',').map(Number)
        : [];
      filterQuery['discount'] = { $nin: discountArray };
    }

    try {
      const pipeline = [
        { $match: filterQuery },
        {
          $facet: {
            createdBy: [
              {
                $match: {
                  createdBy: { $ne: null },
                  status: { $ne: 'cancelled' },
                },
              },
              {
                $group: {
                  _id: '$createdBy',
                  count: { $sum: 1 },
                  tables: { $addToSet: '$table' },
                },
              },
              {
                $project: {
                  user: '$_id',
                  createdByCount: '$count',
                  createdByTables: '$tables',
                  _id: 0,
                },
              },
            ],
            preparedBy: [
              {
                $match: {
                  preparedBy: { $ne: null },
                  status: { $ne: 'cancelled' },
                },
              },
              {
                $group: {
                  _id: '$preparedBy',
                  count: { $sum: 1 },
                  tables: { $addToSet: '$table' },
                },
              },
              {
                $project: {
                  user: '$_id',
                  preparedByCount: '$count',
                  preparedByTables: '$tables',
                  _id: 0,
                },
              },
            ],
            cancelledBy: [
              { $match: { cancelledBy: { $ne: null }, status: 'cancelled' } },
              {
                $group: {
                  _id: '$cancelledBy',
                  count: { $sum: 1 },
                  tables: { $addToSet: '$table' },
                },
              },
              {
                $project: {
                  user: '$_id',
                  cancelledByCount: '$count',
                  cancelledByTables: '$tables',
                  _id: 0,
                },
              },
            ],
            deliveredBy: [
              {
                $match: {
                  deliveredBy: { $ne: null },
                  status: { $ne: 'cancelled' },
                },
              },
              {
                $group: {
                  _id: '$deliveredBy',
                  count: { $sum: 1 },
                  tables: { $addToSet: '$table' },
                },
              },
              {
                $project: {
                  user: '$_id',
                  deliveredByCount: '$count',
                  deliveredByTables: '$tables',
                  _id: 0,
                },
              },
            ],
          },
        },
        {
          $project: {
            combined: {
              $concatArrays: [
                '$createdBy',
                '$preparedBy',
                '$cancelledBy',
                '$deliveredBy',
              ],
            },
          },
        },
        { $unwind: '$combined' },
        {
          $group: {
            _id: '$combined.user',
            user: { $first: '$combined.user' },
            createdByCount: { $max: '$combined.createdByCount' },
            preparedByCount: { $max: '$combined.preparedByCount' },
            cancelledByCount: { $max: '$combined.cancelledByCount' },
            deliveredByCount: { $max: '$combined.deliveredByCount' },
            createdByTables: { $push: '$combined.createdByTables' },
            preparedByTables: { $push: '$combined.preparedByTables' },
            cancelledByTables: { $push: '$combined.cancelledByTables' },
            deliveredByTables: { $push: '$combined.deliveredByTables' },
          },
        },
        {
          $project: {
            user: 1,
            createdByCount: { $ifNull: ['$createdByCount', 0] },
            preparedByCount: { $ifNull: ['$preparedByCount', 0] },
            cancelledByCount: { $ifNull: ['$cancelledByCount', 0] },
            deliveredByCount: { $ifNull: ['$deliveredByCount', 0] },
            createdByTableCount: {
              $size: {
                $reduce: {
                  input: '$createdByTables',
                  initialValue: [],
                  in: { $setUnion: ['$$value', '$$this'] },
                },
              },
            },
            preparedByTableCount: {
              $size: {
                $reduce: {
                  input: '$preparedByTables',
                  initialValue: [],
                  in: { $setUnion: ['$$value', '$$this'] },
                },
              },
            },
            cancelledByTableCount: {
              $size: {
                $reduce: {
                  input: '$cancelledByTables',
                  initialValue: [],
                  in: { $setUnion: ['$$value', '$$this'] },
                },
              },
            },
            deliveredByTableCount: {
              $size: {
                $reduce: {
                  input: '$deliveredByTables',
                  initialValue: [],
                  in: { $setUnion: ['$$value', '$$this'] },
                },
              },
            },
            createdByTables: {
              $reduce: {
                input: '$createdByTables',
                initialValue: [],
                in: { $setUnion: ['$$value', '$$this'] },
              },
            },
            preparedByTables: {
              $reduce: {
                input: '$preparedByTables',
                initialValue: [],
                in: { $setUnion: ['$$value', '$$this'] },
              },
            },
            cancelledByTables: {
              $reduce: {
                input: '$cancelledByTables',
                initialValue: [],
                in: { $setUnion: ['$$value', '$$this'] },
              },
            },
            deliveredByTables: {
              $reduce: {
                input: '$deliveredByTables',
                initialValue: [],
                in: { $setUnion: ['$$value', '$$this'] },
              },
            },
          },
        },
      ];

      const results = await this.orderModel.aggregate(pipeline).exec();
      return results;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOrderByItemId(id: number) {
    const orders = await this.orderModel.find({ item: id });
    return orders;
  }

  async findTodayOrders(after: string) {
    const start = new Date(after);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(after);
    end.setUTCHours(23, 59, 59, 999);
    try {
      const orders = await this.orderModel
        .find({
          tableDate: { $gte: start, $lte: end }, // Only orders on 'after' date
        })
        .populate(
          'table',
          'date _id name isOnlineSale finishHour type startHour',
        )
        .exec();
      return orders;
    } catch (error) {
      throw new HttpException(
        "Failed to fetch today's orders",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findTodayCollections(after: string) {
    const start = new Date(after);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(after);
    end.setUTCHours(23, 59, 59, 999);
    try {
      const collections = await this.collectionModel
        .find({
          tableDate: { $gte: start, $lte: end },
        })
        .populate(
          'table',
          'date _id name isOnlineSale finishHour type startHour',
        )
        .exec();
      return collections;
    } catch (error) {
      throw new HttpException(
        "Failed to fetch today's collections",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findTopOrderCreators(date: string, location: number) {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setUTCHours(23, 59, 59, 999);
    try {
      const results = await this.orderModel.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            location: Number(location),
            status: { $ne: OrderStatus.CANCELLED },
          },
        },
        {
          $lookup: {
            from: 'menuitems',
            localField: 'item',
            foreignField: '_id',
            as: 'item',
          },
        },
        { $unwind: '$item' },
        {
          $match: {
            'item.category': { $nin: [9, 25, 26, 27] },
          },
        },
        {
          $group: {
            _id: '$createdBy',
            orderCount: { $sum: 1 },
          },
        },
        {
          $sort: { orderCount: -1 },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        {
          $unwind: '$user',
        },
        {
          $project: {
            _id: 0,
            userId: '$user._id',
            userName: '$user.name',
            orderCount: 1,
          },
        },
      ]);

      return results;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch top order creators',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async findTopOrderDeliverers(date: string, location: number) {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setUTCHours(23, 59, 59, 999);
    try {
      const results = await this.orderModel.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            location: Number(location),
            status: { $ne: OrderStatus.CANCELLED },
          },
        },
        {
          $lookup: {
            from: 'tables',
            localField: 'table',
            foreignField: '_id',
            as: 'table',
          },
        },
        { $unwind: '$table' },
        {
          $match: {
            'table.type': { $ne: TableTypes.TAKEOUT },
          },
        },
        {
          $group: {
            _id: '$deliveredBy',
            orderCount: { $sum: 1 },
          },
        },
        {
          $sort: { orderCount: -1 },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        {
          $unwind: '$user',
        },
        {
          $project: {
            _id: 0,
            userId: '$user._id',
            userName: '$user.name',
            orderCount: 1,
          },
        },
      ]);
      return results;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch top order deliverers',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async findTopCollectionCreators(date: string, location: number) {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setUTCHours(23, 59, 59, 999);
    try {
      const results = await this.collectionModel.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            location: Number(location),
            status: {
              $ne: OrderCollectionStatus.CANCELLED,
            },
          },
        },
        {
          $group: {
            _id: '$createdBy',
            collectionCount: { $sum: 1 },
          },
        },
        {
          $sort: { collectionCount: -1 },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        {
          $unwind: '$user',
        },
        {
          $project: {
            _id: 0,
            userId: '$user._id',
            userName: '$user.name',
            collectionCount: 1,
          },
        },
      ]);
      return results;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch top collectors',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async findOrderPreparationStats(date: string, location: number) {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setUTCHours(23, 59, 59, 999);
    const formatDuration = (ms: number) => {
      const totalSeconds = Math.floor(ms / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    };
    try {
      const [stats] = await this.orderModel.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            preparedAt: { $exists: true },
            location: Number(location),
            status: {
              $nin: [
                OrderStatus.CANCELLED,
                OrderStatus.AUTOSERVED,
                OrderStatus.WASTED,
              ],
            },
          },
        },
        {
          $lookup: {
            from: 'menuitems',
            localField: 'item',
            foreignField: '_id',
            as: 'menuItem',
          },
        },
        { $unwind: '$menuItem' },
        {
          $lookup: {
            from: 'tables',
            localField: 'table',
            foreignField: '_id',
            as: 'orderTable',
          },
        },
        { $unwind: '$orderTable' },
        {
          $match: {
            'menuItem.category': { $ne: 30 },
          },
        },
        {
          $project: {
            _id: 1,
            preparationTimeMs: { $subtract: ['$preparedAt', '$createdAt'] },
            item: 1,
            orderTable: 1,
            deliveredAt: 1,
          },
        },
        {
          $facet: {
            average: [
              {
                $group: {
                  _id: null,
                  averagePreparationTimeMs: { $avg: '$preparationTimeMs' },
                },
              },
              {
                $project: {
                  _id: 0,
                  averagePreparationTimeMs: 1,
                },
              },
            ],
            topOrders: [
              { $sort: { preparationTimeMs: -1 } },
              { $limit: 3 },
              {
                $project: {
                  _id: 1,
                  item: 1,
                  orderTable: 1,
                  preparationTimeMs: 1,
                  deliveredAt: 1,
                },
              },
            ],
          },
        },
      ]);
      const avgRow = stats.average[0] || { averagePreparationTimeMs: 0 };
      const avgMs = avgRow.averagePreparationTimeMs;
      return {
        average: {
          ms: avgMs,
          formatted: formatDuration(avgMs),
        },
        topOrders: stats.topOrders.map(
          (o: {
            _id: number;
            item: number;
            orderTable: unknown;
            preparationTimeMs: number;
            deliveredAt: Date;
          }) => ({
            order: o,
            ms: o.preparationTimeMs,
            formatted: formatDuration(o.preparationTimeMs),
          }),
        ),
      };
    } catch (error) {
      throw new HttpException(
        'Failed to fetch preparation time stats',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async findGivenDateOrders(date: string, location: number) {
    try {
      const parsedDate = parseISO(date);
      const tables = await this.tableService.findByDateAndLocationWithOrderData(
        format(parsedDate, 'yyyy-MM-dd'),
        location,
      );
      const orders = tables.reduce(
        (acc, table) => acc.concat(table.orders),
        [],
      );

      return orders;
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async findGivenTableOrders(tableId: number) {
    try {
      const tableOrders = await this.orderModel
        .find({ table: tableId })
        .populate(
          'table',
          'date _id name isOnlineSale finishHour type startHour',
        )
        .exec();

      return tableOrders;
    } catch (error) {
      throw new HttpException(
        "Failed to fetch given day's orders",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async createMultipleOrder(
    user: User,
    orders: CreateOrderDto[],
    table: Table,
  ) {
    // Check if table is closed (finishHour exists)
    if (table.finishHour) {
      throw new HttpException(
        'Cannot add orders to a closed table',
        HttpStatus.BAD_REQUEST,
      );
    }
    const createdOrders: number[] = [];
    const orderKitchenIds: string[] = [];

    for (const order of orders) {
      if (order.quantity <= 0) {
        continue;
      }
      if (table.type === TableTypes.ACTIVITY && !order?.activityPlayer) {
        throw new HttpException(
          'Activity tables require an activityPlayer',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (Array.isArray(order.discountNote)) {
        order.discountNote = order.discountNote.join(',');
      }
      const createdOrder = new this.orderModel({
        ...order,
        tableDate: table.date,
        status: order?.status ?? 'pending',
        createdBy: order?.createdBy ?? user._id,
        createdAt: new Date(),
        table: table._id,
      });
      orderKitchenIds.push(createdOrder.kitchen);
      const users = await this.userService.findAllUsers();
      if (createdOrder?.discount) {
        const discount = await this.discountModel.findById(
          createdOrder.discount,
        );
        if (!discount) {
          throw new HttpException('Discount not found', HttpStatus.NOT_FOUND);
        }
        if (discount?.isNoteRequired && !order.discountNote) {
          throw new HttpException(
            'Discount note is required for this discount',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (discount?.percentage) {
          createdOrder.discountPercentage = discount.percentage;
          if (createdOrder.discountPercentage >= 100) {
            createdOrder.paidQuantity = createdOrder.quantity;
          }
        }
        if (discount?.amount) {
          const discountPerUnit = discount.amount / createdOrder.quantity;
          createdOrder.discountAmount = Math.min(
            discountPerUnit,
            createdOrder.unitPrice,
          );
          if (createdOrder.discountAmount >= createdOrder.unitPrice) {
            createdOrder.paidQuantity = createdOrder.quantity;
          }
        }
      }
      try {
        await createdOrder.save();
        createdOrders.push(createdOrder._id);
        const orderWithItem = await createdOrder.populate([
          { path: 'item' },
          {
            path: 'table',
            select: 'date _id name isOnlineSale finishHour type startHour',
          },
        ]);
        for (const ingredient of (
          orderWithItem.item as unknown as PopulatedMenuItem
        ).itemProduction) {
          const isStockDecrementRequired = ingredient?.isDecrementStock;
          if (isStockDecrementRequired) {
            const consumptionQuantity =
              ingredient?.quantity * orderWithItem.quantity;
            await this.accountingService.consumptStock(user, {
              product: ingredient?.product,
              location: createdOrder?.stockLocation ?? createdOrder?.location,
              quantity: consumptionQuantity,
              status:
                createdOrder?.stockNote ?? StockHistoryStatusEnum.ORDERCREATE,
            });
          }
        }
        this.activityService.addActivity(
          users.find((user) => user._id === createdOrder.createdBy),
          ActivityType.CREATE_ORDER,
          createdOrder,
        );
        if (createdOrder?.discount) {
          this.activityService.addActivity(
            users.find((user) => user._id === createdOrder.createdBy),
            ActivityType.ORDER_DISCOUNT,
            createdOrder,
          );
        }

        await this.tableService.updateTableOrders(
          user,
          table._id,
          createdOrders,
        );
      } catch (error) {
        this.logger.error('Error in order processing:', error);
        throw new HttpException(
          'Failed to create order',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
    const orderGroupModel = new this.orderGroupModel({
      orders: createdOrders,
      table: table._id,
      createdBy: user._id,
      createdAt: new Date(),
      tableDate: new Date(table.date) ?? new Date(),
    });
    await orderGroupModel.save();
    this.websocketGateway.emitOrderGroupChanged();
    // to change the orders page in the frontend
    this.websocketGateway.emitCreateMultipleOrder(
      user,
      table,
      table.location,
      orderKitchenIds,
    );
    return createdOrders;
  }
  async createOrder(user: User, createOrderDto: CreateOrderDto) {
    const users = await this.userService.findAllUsers();
    if (createOrderDto.quantity <= 0) {
      throw new HttpException(
        'Quantity must be greater than 0',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (Array.isArray(createOrderDto.discountNote)) {
      createOrderDto.discountNote = createOrderDto.discountNote.join(',');
    }

    // Check if table is closed (finishHour exists) and activity table player requirement
    if (createOrderDto.table) {
      const table = await this.tableService.findById(createOrderDto.table);
      if (table && table.finishHour) {
        throw new HttpException(
          'Cannot add orders to a closed table',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (
        table.type === TableTypes.ACTIVITY &&
        !createOrderDto?.activityPlayer
      ) {
        throw new HttpException(
          'Activity tables require an activityPlayer',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // Ensure tableDate is always set
    let tableDate = createOrderDto?.tableDate;
    if (!tableDate && createOrderDto.table) {
      const table = await this.tableService.findById(createOrderDto.table);
      tableDate = table?.date ? new Date(table.date) : new Date();
    }
    if (!tableDate) {
      tableDate = new Date();
    }

    const order = new this.orderModel({
      ...createOrderDto,
      status: createOrderDto?.status ?? 'pending',
      createdBy: createOrderDto?.createdBy ?? user._id,
      createdAt: new Date(),
      tableDate: tableDate,
    });
    if (createOrderDto?.discount) {
      const discount = await this.discountModel.findById(
        createOrderDto.discount,
      );

      if (!discount) {
        throw new HttpException('Discount not found', HttpStatus.NOT_FOUND);
      }
      if (discount?.isNoteRequired && !createOrderDto.discountNote) {
        throw new HttpException(
          'Discount note is required for this discount',
          HttpStatus.BAD_REQUEST,
        );
      }
      order.discount = discount._id;
      if (discount?.percentage) {
        order.discountPercentage = discount.percentage;
        if (order.discountPercentage >= 100) {
          order.paidQuantity = order.quantity;
        }
      }
      if (discount?.amount) {
        const discountPerUnit = discount.amount / order.quantity;
        order.discountAmount = Math.min(discountPerUnit, order.unitPrice);
        if (order.discountAmount >= order.unitPrice) {
          order.paidQuantity = order.quantity;
        }
      }
    }

    try {
      await order.save();
      const orderGroupModel = new this.orderGroupModel({
        orders: [order._id],
        table: order?.table,
        createdBy: user._id,
        createdAt: order.createdAt,
        tableDate: order?.tableDate ?? order.createdAt,
      });
      await orderGroupModel.save();
      this.websocketGateway.emitOrderGroupChanged();
      const orderWithItem = await order.populate([
        { path: 'item' },
        { path: 'kitchen' },
        {
          path: 'table',
          select: 'date _id name isOnlineSale finishHour type startHour',
        },
      ]);

      if (isPopulatedMenuItem(orderWithItem.item)) {
        for (const ingredient of orderWithItem.item.itemProduction) {
          const isStockDecrementRequired = ingredient?.isDecrementStock;
          if (isStockDecrementRequired) {
            const consumptionQuantity =
              ingredient?.quantity * orderWithItem.quantity;
            await this.accountingService.consumptStock(user, {
              product: ingredient?.product,
              location: order?.stockLocation ?? order?.location,
              quantity: consumptionQuantity,
              status:
                createOrderDto?.stockNote ?? StockHistoryStatusEnum.ORDERCREATE,
            });
          }
        }
      }
      try {
        await this.activityService.addActivity(
          users.find((user) => user._id === order.createdBy),
          ActivityType.CREATE_ORDER,
          order,
        );
      } catch (error) {
        this.logger.error('Error adding create order activity:', error);
      }
      if (order.discount) {
        try {
          await this.activityService.addActivity(
            user,
            ActivityType.ORDER_DISCOUNT,
            order,
          );
        } catch (error) {
          this.logger.error('Error adding order discount activity:', error);
        }
      }
      if (order?.table) {
        try {
          this.websocketGateway.emitOrderCreated(order);
        } catch (error) {
          this.logger.error('Error emitting order created:', error);
        }
      }
    } catch (error) {
      this.logger.error('Error in createOrder:', error);
      this.logger.error('Full error details:', JSON.stringify(error, null, 2));
      throw new HttpException(
        `Failed to create order: ${error?.message || 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    if (createOrderDto?.table) {
      let updatedTable;
      try {
        updatedTable = await this.tableService.updateTableOrders(
          user,
          createOrderDto.table,
          order._id,
        );
      } catch (error) {
        // Clean up by deleting the order if updating the table fails
        await this.orderModel.findByIdAndDelete(order._id);
        this.websocketGateway.emitOrderDeleted(order);
        throw new HttpException(
          'Failed to update table orders',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      if (!updatedTable) {
        throw new HttpException('Table not found', HttpStatus.BAD_REQUEST);
      }
    }
    if (order.status === OrderStatus.CONFIRMATIONREQ) {
      await this.confirmationQueue.add(
        'check-confirmation',
        { orderId: order._id.toString() },
        { delay: 5 * 60 * 1000, attempts: 1 },
      );
    }

    return order;
  }
  async checkConfirmationTimeout(orderId: string) {
    const order = await this.orderModel
      .findById(orderId)
      .populate({ path: 'item', select: 'name' })
      .populate({ path: 'kitchen', select: 'name' });

    if (!order) {
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    }

    if (order.status === OrderStatus.CONFIRMATIONREQ && !order?.confirmedBy) {
      const visits = await this.visitService.findByDateAndLocation(
        format(order.createdAt, 'yyyy-MM-dd'),
        2,
      );
      const uniqueVisitUsers =
        visits
          ?.reduce(
            (acc: { unique: typeof visits; seenUsers: SeenUsers }, visit) => {
              acc.seenUsers = acc.seenUsers || {};
              const userId =
                typeof visit?.user === 'string'
                  ? visit.user
                  : (visit?.user as User)?._id;
              if (visit?.user && !acc.seenUsers[userId]) {
                acc.seenUsers[userId] = true;
                acc.unique.push(visit);
              }
              return acc;
            },
            { unique: [], seenUsers: {} },
          )
          ?.unique?.map((visit) => visit.user) ?? [];
      const message = {
        key: 'OrderNotConfirmedForMinutes',
        params: {
          brand: isPopulatedKitchen(order?.kitchen) ? order.kitchen.name : '',
          product: isPopulatedMenuItem(order.item) ? order.item.name : '',
          minutes: 5,
        },
      };
      const notificationEvents =
        await this.notificationService.findAllEventNotifications();
      const kitchenNotConfirmedEvent = notificationEvents.find(
        (notification) =>
          notification.event === NotificationEventType.KITCHENNOTCONFIRMED,
      );

      if (kitchenNotConfirmedEvent) {
        await this.notificationService.createNotification({
          type: kitchenNotConfirmedEvent.type,
          createdBy: kitchenNotConfirmedEvent.createdBy,
          selectedUsers: kitchenNotConfirmedEvent.selectedUsers,
          selectedRoles: kitchenNotConfirmedEvent.selectedRoles,
          selectedLocations: kitchenNotConfirmedEvent.selectedLocations,
          seenBy: [],
          event: NotificationEventType.KITCHENNOTCONFIRMED,
          message,
        });
      }
    }
  }
  async returnOrder(
    user: User,
    id: number,
    returnQuantity: number,
    paymentMethod: string,
  ) {
    try {
      const order = await this.orderModel.findById(id).lean();
      if (!order) {
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }
      const statusErrors = {
        [OrderStatus.CANCELLED]: 'Order is already cancelled',
        [OrderStatus.WASTED]: 'Order is already wasted',
        [OrderStatus.RETURNED]: 'Order is already returned',
      };

      if (statusErrors[order.status]) {
        throw new HttpException(
          statusErrors[order.status],
          HttpStatus.BAD_REQUEST,
        );
      }
      if (order.isReturned) {
        throw new HttpException(
          'Order is already returned',
          HttpStatus.BAD_REQUEST,
        );
      }
      const {
        preparedAt,
        preparedBy,
        deliveredAt,
        deliveredBy,
        cancelledAt,
        cancelledBy,
        table,
        ...orderWithoutUnwantedFields
      } = order;
      // Create the return order
      const returnOrder = await this.orderModel.create({
        ...orderWithoutUnwantedFields,
        status: OrderStatus.RETURNED,
        quantity: returnQuantity,
        paidQuantity: returnQuantity,
        createdAt: new Date(),
        createdBy: orderWithoutUnwantedFields?.createdBy ?? user._id,
        unitPrice: -order.unitPrice,
      });

      const returnOrderDiscountTotal = returnOrder?.discountAmount
        ? returnOrder?.discountAmount
        : (returnOrder.unitPrice *
            returnOrder.quantity *
            (returnOrder?.discountPercentage ?? 0)) /
          100;

      const returnOrderTotalAmount =
        returnOrder.unitPrice * returnOrder.quantity - returnOrderDiscountTotal;
      //create collection for return order
      await this.collectionModel.create({
        location: order.location,
        amount: returnOrderTotalAmount,
        status: OrderCollectionStatus.RETURNED,
        paymentMethod: paymentMethod,
        createdAt: new Date(),
        createdBy: orderWithoutUnwantedFields?.createdBy ?? user._id,
        orders: [
          {
            order: returnOrder._id,
            paidQuantity: returnOrder.quantity,
          },
        ],
      });
      // increment the stock
      const populatedReturnOrder = await this.orderModel
        .findById(returnOrder._id)
        .populate('item');
      if (isPopulatedMenuItem(populatedReturnOrder?.item)) {
        for (const ingredient of populatedReturnOrder.item.itemProduction) {
          if (ingredient?.isDecrementStock) {
            const incrementQuantity =
              ingredient?.quantity * populatedReturnOrder?.quantity;
            await this.accountingService.createStock(user, {
              product: ingredient?.product,
              location: populatedReturnOrder?.stockLocation,
              quantity: incrementQuantity,
              status: StockHistoryStatusEnum.ORDERRETURN,
            });
          }
        }
      }
      //update the original order status
      await this.orderModel.findByIdAndUpdate(
        id,
        {
          isReturned: true,
        },
        {
          new: true,
        },
      );
      //emit the return order create
      this.websocketGateway.emitOrderCreated(returnOrder);
      return returnOrder;
    } catch (error) {
      this.logger.error('Error in returnOrder:', error);
      throw new HttpException(
        error?.message || 'Failed to process the return order',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateOrder(user: User, id: number, updates: UpdateQuery<Order>) {
    const oldOrder = await this.orderModel.findById(id).populate('item');
    // adding activities
    if (updates?.status) {
      if (updates?.status === OrderStatus.READYTOSERVE && !updates?.quantity) {
        await this.activityService.addActivity(
          user,
          ActivityType.PREPARE_ORDER,
          oldOrder,
        );
      }
      if (updates?.status === OrderStatus.SERVED && !updates?.quantity) {
        await this.activityService.addActivity(
          user,
          ActivityType.DELIVER_ORDER,
          oldOrder,
        );
      }
      if (updates?.status === OrderStatus.CANCELLED && !updates?.quantity) {
        await this.activityService.addActivity(
          user,
          ActivityType.CANCEL_ORDER,
          oldOrder,
        );
      }
      if (updates.discount) {
        await this.activityService.addActivity(
          user,
          ActivityType.ORDER_DISCOUNT,
          oldOrder,
        );
      }

      if (
        updates?.status === OrderStatus.CANCELLED &&
        isPopulatedMenuItem(oldOrder?.item)
      ) {
        for (const ingredient of oldOrder.item.itemProduction) {
          const isStockDecrementRequired = ingredient?.isDecrementStock;
          if (isStockDecrementRequired) {
            const incrementQuantity = ingredient?.quantity * oldOrder?.quantity;
            await this.accountingService.createStock(user, {
              product: ingredient?.product,
              location: oldOrder?.stockLocation,
              quantity: incrementQuantity,
              status: updates?.stockNote ?? StockHistoryStatusEnum.ORDERCANCEL,
            });
          }
        }
        await this.activityService.addActivity(
          user,
          ActivityType.CANCEL_ORDER,
          oldOrder,
        );
      }
      if (updates?.quantity && updates?.quantity > oldOrder.quantity) {
        await this.activityService.addActivity(
          user,
          ActivityType.ADD_ORDER,
          oldOrder,
        );
      }
      if (
        oldOrder?.status === OrderStatus.CANCELLED &&
        ![
          OrderStatus.WASTED,
          OrderStatus.RETURNED,
          OrderStatus.CANCELLED,
        ].includes(updates?.status) &&
        isPopulatedMenuItem(oldOrder?.item)
      ) {
        for (const ingredient of oldOrder.item.itemProduction) {
          const isStockDecrementRequired = ingredient?.isDecrementStock;
          if (isStockDecrementRequired) {
            const incrementQuantity = ingredient?.quantity * oldOrder?.quantity;
            await this.accountingService.consumptStock(user, {
              product: ingredient?.product,
              location: oldOrder?.stockLocation,
              quantity: incrementQuantity,
              status: StockHistoryStatusEnum.ORDERCREATE,
            });
          }
        }
      }
    }
    if (updates?.quantity) {
      const oldOrder = await (
        await this.orderModel.findById(id)
      ).populate('item');
      if (
        oldOrder?.quantity < updates?.quantity &&
        isPopulatedMenuItem(oldOrder?.item)
      ) {
        for (const ingredient of oldOrder.item.itemProduction) {
          const isStockDecrementRequired = ingredient?.isDecrementStock;
          if (isStockDecrementRequired) {
            const incrementQuantity =
              ingredient?.quantity * (updates?.quantity - oldOrder?.quantity);
            await this.accountingService.consumptStock(user, {
              product: ingredient?.product,
              location: oldOrder?.stockLocation,
              quantity: incrementQuantity,
              status: StockHistoryStatusEnum.ORDERCREATE,
            });
          }
        }
        await this.activityService.addActivity(user, ActivityType.ADD_ORDER, {
          ...oldOrder,
          quantity: updates?.quantity,
        });
      } else if (
        updates?.quantity < oldOrder?.quantity &&
        isPopulatedMenuItem(oldOrder?.item)
      ) {
        for (const ingredient of oldOrder.item.itemProduction) {
          const isStockDecrementRequired = ingredient?.isDecrementStock;
          if (isStockDecrementRequired) {
            const incrementQuantity =
              ingredient?.quantity * (oldOrder?.quantity - updates?.quantity);
            await this.accountingService.createStock(user, {
              product: ingredient?.product,
              location: oldOrder?.stockLocation,
              quantity: incrementQuantity,
              status: StockHistoryStatusEnum.ORDERCANCEL,
            });
          }
        }
        await this.activityService.addActivity(
          user,
          ActivityType.CANCEL_ORDER,
          {
            ...oldOrder,
            quantity: updates?.quantity,
          },
        );
      }
    }
    if (updates?.division === 1) {
      return this.orderModel
        .findByIdAndUpdate(id, { $unset: { division: '' } }, { new: true })
        .then((order) => {
          this.websocketGateway.emitOrderUpdated([order]);
          return order;
        });
    } else {
      return this.orderModel
        .findByIdAndUpdate(id, updates, {
          new: true,
        })
        .then((order) => {
          this.websocketGateway.emitOrderUpdated([order]);
          return order;
        });
    }
  }
  async simpleOrderUpdate(user: User, id: number, updates: Partial<Order>) {
    try {
      const order = await this.orderModel.findByIdAndUpdate(id, updates, {
        new: true,
      });
      if (!order) {
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }

      // If this is a Shopify pickup order being marked as picked up, create fulfillment
      if (
        updates.isShopifyCustomerPicked === true &&
        order.shopifyCustomer
      ) {
        // If we don't have the fulfillment order ID yet, try to fetch it
        if (!order.shopifyFulfillmentOrderId && order.shopifyOrderLineItemId) {
          this.logger.log(
            `Order ${id} doesn't have fulfillment order ID, attempting to fetch it...`,
          );
          await this.shopifyService.updateOrderWithFulfillmentOrderId(
            order.shopifyOrderLineItemId,
          );
          // Refetch the order to get the updated fulfillment order ID
          const updatedOrder = await this.orderModel.findById(id);
          if (updatedOrder?.shopifyFulfillmentOrderId) {
            order.shopifyFulfillmentOrderId =
              updatedOrder.shopifyFulfillmentOrderId;
          }
        }

        // Now create the fulfillment if we have the ID
        if (order.shopifyFulfillmentOrderId) {
          try {
            await this.shopifyService.createFulfillmentForPickup(
              order.shopifyFulfillmentOrderId,
              false, // Don't notify customer by default
            );
            this.logger.log(
              `Shopify fulfillment created for order ${id} with fulfillment order ID ${order.shopifyFulfillmentOrderId}`,
            );
          } catch (fulfillmentError) {
            this.logger.error(
              `Failed to create Shopify fulfillment for order ${id}:`,
              fulfillmentError,
            );
            // Don't throw - allow the order update to succeed even if Shopify fulfillment fails
          }
        } else {
          this.logger.warn(
            `Cannot create Shopify fulfillment for order ${id}: No fulfillment order ID found`,
          );
        }
      }

      this.websocketGateway.emitOrderUpdated([order]);
      return order;
    } catch (error) {
      throw new HttpException(
        'Failed to update order',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async cancelIkasOrder(user: User, ikasId: string, quantity: number) {
    try {
      const order = await this.orderModel
        .findOne({ ikasId: ikasId })
        .populate('item');
      const collection = await this.collectionModel.findOne({ ikasId: ikasId });
      if (!order || !collection) {
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }
      if (
        order.status === OrderStatus.CANCELLED ||
        collection.status === OrderCollectionStatus.CANCELLED ||
        quantity > order.quantity
      ) {
        throw new HttpException(
          'Order already cancelled',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (order?.quantity !== quantity) {
        const newQuantity = order.quantity - quantity;
        const orderWithoutId = order.toObject();
        delete orderWithoutId._id;
        const newOrderData = {
          ...orderWithoutId,
          quantity: newQuantity,
          paidQuantity: newQuantity,
        };
        const newOrder = await this.orderModel.create(newOrderData);
        const newCollection = await this.collectionModel.create({
          ...collection.toObject(),
          orders: [
            {
              order: newOrder._id,
              paidQuantity: newQuantity,
            },
          ],
        });
        this.websocketGateway.emitCollectionChanged(newCollection);
        await this.orderModel.findByIdAndUpdate(
          order._id,
          {
            $set: {
              status: OrderStatus.CANCELLED,
              cancelledAt: new Date(),
              cancelledBy: user._id,
              quantity: quantity,
              paidQuantity: quantity,
            },
            $unset: {
              ikasCustomer: '',
              isIkasCustomerPicked: '',
            },
          },
          { new: true },
        );
        await this.collectionModel.findByIdAndUpdate(
          collection._id,
          {
            status: OrderCollectionStatus.CANCELLED,
            orders: [
              {
                order: order._id,
                paidQuantity: quantity,
              },
            ],
            cancelledAt: new Date(),
            cancelledBy: user._id,
          },
          { new: true },
        );
        if (isPopulatedMenuItem(order?.item)) {
          for (const ingredient of order.item.itemProduction) {
            if (ingredient?.isDecrementStock) {
              const incrementQuantity = ingredient?.quantity * quantity;
              await this.accountingService.createStock(user, {
                product: ingredient?.product,
                location: order?.stockLocation,
                quantity: incrementQuantity,
                status: StockHistoryStatusEnum.IKASORDERCANCEL,
              });
            }
          }
        }
      } else {
        await this.orderModel.findByIdAndUpdate(
          order._id,
          {
            $set: {
              status: OrderStatus.CANCELLED,
              cancelledAt: new Date(),
              cancelledBy: user._id,
            },
            $unset: {
              ikasCustomer: '',
              isIkasCustomerPicked: '',
            },
          },
          { new: true },
        );

        await this.collectionModel.findByIdAndUpdate(
          collection._id,
          {
            status: OrderCollectionStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelledBy: user._id,
          },
          { new: true },
        );
        if (isPopulatedMenuItem(order?.item)) {
          for (const ingredient of order.item.itemProduction) {
            if (ingredient?.isDecrementStock) {
              const incrementQuantity = ingredient?.quantity * order?.quantity;
              await this.accountingService.createStock(user, {
                product: ingredient?.product,
                location: order?.stockLocation,
                quantity: incrementQuantity,
                status: StockHistoryStatusEnum.IKASORDERCANCEL,
              });
            }
          }
        }
      }
      await this.websocketGateway.emitOrderUpdated([order]);
      this.websocketGateway.emitCollectionChanged(collection);
      return { message: 'Order cancelled successfully' };
    } catch (error) {
      this.logger.error('Error cancelling ikas order:', error);
      throw new HttpException(
        'Failed to cancel order',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async cancelShopifyOrder(
    user: User,
    shopifyOrderLineItemId: string,
    quantity: number,
  ) {
    const session = await this.conn.startSession();
    let result = null;

    try {
      await session.withTransaction(async () => {
        // Find order by shopifyOrderLineItemId (not shopifyOrderId, because we can have multiple orders per Shopify order)
        const order = await this.orderModel
          .findOne({ shopifyOrderLineItemId }, null, { session })
          .populate('item');

        if (!order) {
          throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
        }

        // Find collection by shopifyOrderId from the order
        const collection = await this.collectionModel.findOne(
          { shopifyId: order.shopifyOrderId },
          null,
          { session },
        );

        if (!collection) {
          throw new HttpException('Collection not found', HttpStatus.NOT_FOUND);
        }

        // Validation checks
        if (
          order.status === OrderStatus.CANCELLED ||
          collection.status === OrderCollectionStatus.CANCELLED ||
          quantity > order.quantity
        ) {
          throw new HttpException(
            'Order already cancelled or invalid quantity',
            HttpStatus.BAD_REQUEST,
          );
        }

        const cancelledAmount = order.unitPrice * quantity;

        // Scenario 1: Partial cancellation (e.g., order has 2, cancel 1)
        if (order.quantity !== quantity) {
          const remainingQuantity = order.quantity - quantity;

          // Create cancelled order for the cancelled quantity
          const orderWithoutId = order.toObject();
          delete orderWithoutId._id;
          delete orderWithoutId.shopifyOrderLineItemId; // Remove shopifyOrderLineItemId from cancelled order
          const [cancelledOrder] = await this.orderModel.create(
            [
              {
                ...orderWithoutId,
                quantity: quantity,
                paidQuantity: quantity,
                status: OrderStatus.CANCELLED,
                cancelledAt: new Date(),
                cancelledBy: user._id,
              },
            ],
            { session },
          );

          // Update the original order with remaining quantity (keep it active, not cancelled)
          await this.orderModel.findByIdAndUpdate(
            order._id,
            {
              $set: {
                quantity: remainingQuantity,
                paidQuantity: remainingQuantity,
              },
            },
            { new: true, session },
          );

          // Restore stock for cancelled quantity
          if (isPopulatedMenuItem(order.item)) {
            for (const ingredient of order.item.itemProduction) {
              if (ingredient?.isDecrementStock) {
                const incrementQuantity = ingredient?.quantity * quantity;
                await this.accountingService.createStock(user, {
                  product: ingredient?.product,
                  location: order?.stockLocation,
                  quantity: incrementQuantity,
                  status: StockHistoryStatusEnum.SHOPIFYORDERCANCEL,
                });
              }
            }
          }

          // Partially refund the order in Shopify (refund specific quantity)
          // Get the Shopify location ID for restocking
          let shopifyLocationId: string | undefined;
          if (order.stockLocation) {
            const location = await this.locationService.findLocationById(
              order.stockLocation,
            );
            shopifyLocationId = location?.shopifyId;
          }

          // Shopify'a partial refund isteği gönderme işlemi kapatıldı
          // await this.shopifyService.partialRefundShopifyOrder(
          //   order.shopifyOrderId,
          //   [
          //     {
          //       lineItemId: shopifyOrderLineItemId,
          //       quantity: quantity,
          //       restockType: 'CANCEL',
          //       locationId: shopifyLocationId,
          //     },
          //   ],
          //   true, // notifyCustomer
          //   `Order partially cancelled - ${quantity} out of ${
          //     order.quantity + quantity
          //   } items cancelled`,
          // );

          // Return cancellation info for collection update
          result = {
            order,
            collection,
            cancelledAmount,
            isPartial: true,
            remainingQuantity,
            cancelledOrder,
          };
        } else {
          // Scenario 2: Full cancellation (cancel entire order)
          await this.orderModel.findByIdAndUpdate(
            order._id,
            {
              $set: {
                status: OrderStatus.CANCELLED,
                cancelledAt: new Date(),
                cancelledBy: user._id,
              },
              $unset: {
                shopifyCustomer: '',
                isShopifyCustomerPicked: '',
              },
            },
            { new: true, session },
          );

          // Restore stock for full quantity
          if (isPopulatedMenuItem(order.item)) {
            for (const ingredient of order.item.itemProduction) {
              if (ingredient?.isDecrementStock) {
                const incrementQuantity = ingredient?.quantity * order.quantity;
                await this.accountingService.createStock(user, {
                  product: ingredient?.product,
                  location: order?.stockLocation,
                  quantity: incrementQuantity,
                  status: StockHistoryStatusEnum.SHOPIFYORDERCANCEL,
                });
              }
            }
          }

          // Shopify'a order cancel isteği gönderme işlemi kapatıldı
          // await this.shopifyService.cancelShopifyOrderAtShopify(
          //   order.shopifyOrderId,
          //   true, // notifyCustomer
          //   true, // restock
          //   OrderCancelReason.CUSTOMER,
          //   'Order fully cancelled',
          // );

          // Return cancellation info for collection update
          result = {
            order,
            collection,
            cancelledAmount,
            isPartial: false,
            remainingQuantity: 0,
            cancelledOrder: null,
          };
        }
      });

      // Emit events after successful transaction
      if (result) {
        if (result.isPartial) {
          await this.websocketGateway.emitOrderUpdated([
            result.order,
            result.cancelledOrder,
          ]);
        } else {
          await this.websocketGateway.emitOrderUpdated([result.order]);
        }
      }

      return result;
    } catch (error) {
      this.logger.error('Error cancelling shopify order:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to cancel order',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      await session.endSession();
    }
  }

  async updateMultipleOrders(
    user: User,
    ids: number[],
    updates: UpdateQuery<Order>,
  ) {
    try {
      await Promise.all(
        ids.map(async (id) => {
          await this.orderModel.findByIdAndUpdate(id, updates, {
            new: true,
          });
        }),
      );
      const orders = await this.orderModel.find({ _id: { $in: ids } });
      this.websocketGateway.emitOrderUpdated(orders);
    } catch (error) {
      this.logger.error('Error updating orders:', error);
      throw new HttpException(
        'Failed to update some orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async updateOrders(
    user: User,
    orders: Order[],
    opts?: { session?: ClientSession; deferEmit?: boolean },
  ): Promise<void> {
    if (!orders?.length) return;
    const session = opts?.session;
    const deferEmit =
      opts?.deferEmit ?? Boolean(session && session.inTransaction?.());
    try {
      const ids = orders.map((o) => o._id);
      const existing = await this.orderModel
        .find({ _id: { $in: ids } }, null, withSession({}, session))
        .lean();
      const map = new Map(
        existing.map((o: OrderDocument) => [String(o._id), o]),
      );
      const missing = ids.filter((id) => !map.has(String(id)));
      if (missing.length) {
        throw new HttpException(
          `Order(s) not found: ${missing.join(', ')}`,
          HttpStatus.NOT_FOUND,
        );
      }
      const ops = orders.map((order) => {
        const old = map.get(String(order._id));
        const updated = {
          ...order,
          _id: old._id,
          item: old.item,
        };
        return {
          updateOne: {
            filter: { _id: order._id },
            update: updated,
          },
        };
      });

      await this.orderModel.bulkWrite(ops, withSession({}, session));
      if (!deferEmit) {
        this.websocketGateway.emitOrderUpdated(orders);
      }
    } catch (err) {
      this.logger.error('Error updating orders:', err);
      throw new HttpException(
        'Failed to update some orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async categoryBasedOrderSummary(
    user: User,
    category?: number,
    location?: number,
    upperCategory?: number,
  ) {
    const twelveMonthsAgo = moment
      .tz('Europe/Istanbul')
      .subtract(12, 'months')
      .startOf('month')
      .toDate();
    let foundUpperCategory;
    if (upperCategory) {
      foundUpperCategory = await this.menuService.findSingleUpperCategory(
        Number(upperCategory),
      );
    }
    let matchStage;
    if (upperCategory) {
      const categoryGroupArray = foundUpperCategory?.categoryGroup?.map(
        (categoryGroup) => categoryGroup?.category,
      );
      matchStage = {
        $match: {
          $expr: {
            $in: ['$itemDetails.category', categoryGroupArray],
          },
          quantity: { $gt: 0 },
        },
      };
    }
    let categoryPipeline: PipelineStage[] = [
      {
        $match: {
          createdAt: { $gte: twelveMonthsAgo },
          status: { $ne: 'CANCELLED' },
          ...(location !== undefined &&
            location && { location: Number(location) }),
          quantity: { $gt: 0 },
        },
      },
      {
        $lookup: {
          from: 'menuitems',
          localField: 'item',
          foreignField: '_id',
          as: 'itemDetails',
        },
      },
      {
        $unwind: {
          path: '$itemDetails',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: {
          'itemDetails.category': Number(category),
        },
      },
      {
        $group: {
          _id: {
            month: { $month: '$createdAt' },
            year: { $year: '$createdAt' },
          },
          total: {
            $sum: {
              $subtract: [
                { $multiply: ['$paidQuantity', '$unitPrice'] },
                {
                  $cond: {
                    if: '$discountPercentage',
                    then: {
                      $multiply: [
                        '$discountPercentage',
                        '$paidQuantity',
                        '$unitPrice',
                        0.01,
                      ],
                    },
                    else: {
                      $multiply: [
                        { $ifNull: ['$discountAmount', 0] },
                        '$paidQuantity',
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 },
      },
      {
        $project: {
          _id: 0,
          month: {
            $arrayElemAt: [
              [
                'January',
                'February',
                'March',
                'April',
                'May',
                'June',
                'July',
                'August',
                'September',
                'October',
                'November',
                'December',
              ],
              { $subtract: ['$_id.month', 1] },
            ],
          },
          year: '$_id.year',
          total: 1,
        },
      },
    ];
    let upperCategoryPipeline: PipelineStage[] = [
      {
        $match: {
          createdAt: { $gte: twelveMonthsAgo },
          status: { $ne: 'CANCELLED' },
          ...(location !== undefined && { location: Number(location) }),
        },
      },
      {
        $lookup: {
          from: 'menuitems',
          localField: 'item',
          foreignField: '_id',
          as: 'itemDetails',
        },
      },
      {
        $unwind: {
          path: '$itemDetails',
          preserveNullAndEmptyArrays: true,
        },
      },
      matchStage,
      {
        $addFields: {
          discountMultiplier: {
            $cond: {
              if: upperCategory,
              then: {
                $reduce: {
                  input: foundUpperCategory?.categoryGroup,
                  initialValue: 1,
                  in: {
                    $cond: [
                      { $eq: ['$$this.category', '$itemDetails.category'] },
                      { $divide: [{ $toDouble: '$$this.percentage' }, 100] },
                      '$$value',
                    ],
                  },
                },
              },
              else: 1,
            },
          },
        },
      },
      {
        $group: {
          _id: {
            month: { $month: '$createdAt' },
            year: { $year: '$createdAt' },
          },
          total: {
            $sum: {
              $subtract: [
                {
                  $multiply: [
                    '$paidQuantity',
                    '$unitPrice',
                    '$discountMultiplier',
                  ],
                },
                {
                  $cond: {
                    if: '$discountPercentage',
                    then: {
                      $multiply: [
                        '$discountPercentage',
                        '$paidQuantity',
                        '$unitPrice',
                        0.01,
                      ],
                    },
                    else: {
                      $multiply: [
                        { $ifNull: ['$discountAmount', 0] },
                        '$paidQuantity',
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 },
      },
      {
        $project: {
          _id: 0,
          month: {
            $arrayElemAt: [
              [
                'January',
                'February',
                'March',
                'April',
                'May',
                'June',
                'July',
                'August',
                'September',
                'October',
                'November',
                'December',
              ],
              { $subtract: ['$_id.month', 1] },
            ],
          },
          year: '$_id.year',
          total: { $toInt: '$total' },
        },
      },
    ];
    const results = upperCategory
      ? await this.orderModel.aggregate(upperCategoryPipeline).exec()
      : await this.orderModel.aggregate(categoryPipeline).exec();
    return results;
  }

  // Collections
  async findAllCollections() {
    try {
      const collections = await this.collectionModel
        .find()
        .populate(
          'table',
          'date _id name isOnlineSale finishHour type startHour',
        )
        .exec();
      return collections;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch collections',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async findQueryCollections(query: CollectionQueryDto) {
    const filterQuery: Record<string, unknown> = {};
    const { after, before, location } = query;
    const IST_OFFSET_MS = 3 * 60 * 60 * 1000;
    if (after) {
      let startUtc: Date;
      if (/^\d{4}-\d{2}-\d{2}$/.test(after)) {
        const [y, m, d] = after.split('-').map(Number);
        const istStart = new Date(y, m - 1, d, 0, 0, 0, 0);
        startUtc = new Date(istStart.getTime() - IST_OFFSET_MS);
      } else {
        const dt = new Date(after);
        startUtc = new Date(dt.getTime() - IST_OFFSET_MS);
      }
      filterQuery.tableDate = { $gte: startUtc };
    }

    if (before) {
      let endUtc: Date;
      if (/^\d{4}-\d{2}-\d{2}$/.test(before)) {
        const [y, m, d] = before.split('-').map(Number);
        const istEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
        endUtc = new Date(istEnd.getTime() - IST_OFFSET_MS);
      } else {
        const dt = new Date(before);
        endUtc = new Date(dt.getTime() - IST_OFFSET_MS);
      }
      filterQuery.tableDate = {
        ...(typeof filterQuery.tableDate === 'object' &&
        filterQuery.tableDate !== null
          ? filterQuery.tableDate
          : {}),
        $lte: endUtc,
      };
    }
    if (location) {
      const locationArray = location
        .split(',')
        .map((item) => item.trim())
        .map(Number);
      filterQuery['location'] = { $in: locationArray };
    }
    try {
      const collections = await this.collectionModel
        .find(filterQuery)
        .populate(
          'table',
          'date _id name isOnlineSale finishHour type startHour',
        )
        .exec();
      return collections;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async findAllPaidWithCancelledIkasOrders() {
    const pipeline = [
      { $match: { status: OrderCollectionStatus.PAID } },
      { $unwind: '$orders' },
      {
        $lookup: {
          from: 'orders',
          localField: 'orders.order',
          foreignField: '_id',
          as: 'matchedOrder',
        },
      },
      { $unwind: '$matchedOrder' },
      {
        $match: {
          'matchedOrder.ikasId': { $exists: true, $ne: null },
          'matchedOrder.status': OrderStatus.CANCELLED,
        },
      },
      { $group: { _id: '$_id', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
    ];
    return await this.collectionModel.aggregate(pipeline).exec();
  }

  async findSummaryCollectionsQuery(query: SummaryCollectionQueryDto) {
    const filterQuery = {};
    const { after, before, location } = query;
    if (!after && !before) {
      throw new HttpException(
        'Failed to fetch summary collections',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (after) {
      filterQuery['createdAt'] = {
        ...filterQuery['createdAt'],
        $gte: new Date(after),
      };
    }
    if (before) {
      filterQuery['createdAt'] = {
        ...filterQuery['createdAt'],
        $lte: new Date(new Date(before).getTime() + 24 * 60 * 60 * 1000),
      };
    }
    if (location && Number(location) !== 0) {
      filterQuery['location'] = Number(location);
    }

    try {
      const collectionsTotal = await this.collectionModel.aggregate([
        {
          $match: {
            ...filterQuery,
            status: 'paid',
          },
        },
        {
          $lookup: {
            from: 'paymentmethods',
            localField: 'paymentMethod',
            foreignField: '_id',
            as: 'paymentMethodDetails',
          },
        },
        {
          $unwind: {
            path: '$paymentMethodDetails',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $match: {
            // Exclude only collections with isPaymentMade: false
            // Include if field is missing or true
            'paymentMethodDetails.isPaymentMade': { $ne: false },
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
          },
        },
      ]);

      return collectionsTotal.length > 0 ? collectionsTotal[0].totalAmount : 0;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch summary collections',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findSummaryDiscountTotal(query: SummaryCollectionQueryDto) {
    const filterQuery = {};
    const { after, before, location } = query;
    if (!after && !before) {
      throw new HttpException(
        'Failed to fetch summary discounts',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (after) {
      filterQuery['createdAt'] = {
        ...filterQuery['createdAt'],
        $gte: new Date(after),
      };
    }
    if (before) {
      filterQuery['createdAt'] = {
        ...filterQuery['createdAt'],
        $lte: new Date(new Date(before).getTime() + 24 * 60 * 60 * 1000),
      };
    }
    if (location && Number(location) !== 0) {
      filterQuery['location'] = Number(location);
    }

    try {
      const discountTotal = await this.orderModel.aggregate([
        {
          $match: {
            ...filterQuery,
            $or: [
              { discountAmount: { $exists: true, $ne: null, $gt: 0 } },
              { discountPercentage: { $exists: true, $ne: null, $gt: 0 } },
            ],
          },
        },
        {
          $addFields: {
            calculatedDiscount: {
              $cond: {
                if: { $gt: ['$discountAmount', 0] },
                then: { $multiply: ['$discountAmount', '$quantity'] },
                else: {
                  $multiply: [
                    { $multiply: ['$unitPrice', '$quantity'] },
                    { $divide: ['$discountPercentage', 100] },
                  ],
                },
              },
            },
          },
        },
        {
          $group: {
            _id: null,
            totalDiscounts: { $sum: '$calculatedDiscount' },
          },
        },
      ]);
      return discountTotal.length > 0
        ? { totalDiscounts: discountTotal[0].totalDiscounts }
        : { totalDiscounts: 0 };
    } catch (error) {
      throw new HttpException(
        'Failed to fetch summary discounts',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findGivenTableCollection(tableId: number) {
    try {
      const tableCollection = await this.collectionModel
        .find({ table: tableId })
        .populate(
          'table',
          'date _id name isOnlineSale finishHour type startHour',
        )
        .exec();

      return tableCollection;
    } catch (error) {
      throw new HttpException(
        "Failed to fetch given day's collections",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  aggregatePaidQuantities(collections: Collection[]) {
    const orderSums = collections.reduce((acc, collection) => {
      collection.orders.forEach((orderItem) => {
        if (acc[orderItem.order]) {
          acc[orderItem.order].paidQuantity += orderItem.paidQuantity;
        } else {
          acc[orderItem.order] = { ...orderItem };
        }
      });
      return acc;
    }, {});

    // Convert the resulting object back to an array
    return Object.values(orderSums);
  }
  async createCollection(user: User, createCollectionDto: CreateCollectionDto) {
    let tableCollections: Collection[] = [];
    if (createCollectionDto.table) {
      tableCollections = await this.collectionModel
        .find({
          table: createCollectionDto.table,
          status: OrderCollectionStatus.PAID,
        })
        .exec();
    }
    const { newOrders, ...filteredCollectionDto } = createCollectionDto;
    if (tableCollections?.length > 0) {
      const tablePaidOrders = this.aggregatePaidQuantities(tableCollections);
      if (newOrders && newOrders?.length > 0) {
        filteredCollectionDto.orders.forEach((orderCollectionItem) => {
          const foundNewOrder = newOrders.find(
            (newOrder) => newOrder._id === orderCollectionItem.order,
          );
          const existingOrder = tablePaidOrders?.find(
            (paidOrder: PaidOrderItem) =>
              paidOrder.order === orderCollectionItem.order,
          ) as PaidOrderItem | undefined;
          const expectedPaidQuantity =
            (existingOrder?.paidQuantity ?? 0) +
            orderCollectionItem.paidQuantity;

          if (foundNewOrder.paidQuantity !== expectedPaidQuantity) {
            throw new HttpException(
              `The quantity of order  is exceeded`,
              HttpStatus.BAD_REQUEST,
            );
          }
        });
      }
    }
    const collection = new this.collectionModel({
      ...filteredCollectionDto, // Use the filtered object
      createdBy: createCollectionDto.createdBy ?? user._id,
      createdAt: new Date(),
    });

    if (newOrders && newOrders?.length > 0) {
      await this.updateOrders(user, newOrders, { deferEmit: false });
    }

    // Consume points if pointUser is provided
    if (createCollectionDto.pointUser) {
      await this.pointService.consumePoint(
        createCollectionDto.pointUser,
        createCollectionDto.amount,
        collection._id,
        createCollectionDto.table,
        createCollectionDto.createdBy ?? user._id,
      );
    } else if (createCollectionDto.pointConsumer) {
      await this.pointService.consumePoint(
        null,
        createCollectionDto.amount,
        collection._id,
        createCollectionDto.table,
        createCollectionDto.createdBy ?? user._id,
        createCollectionDto.pointConsumer,
      );
    }

    try {
      await collection.save();
      try {
        this.websocketGateway.emitCollectionChanged(collection);
      } catch (error) {
        this.logger.error('Error emitting collection changed:', error);
      }
      try {
        await this.activityService.addActivity(
          user,
          ActivityType.TAKE_PAYMENT,
          collection,
        );
      } catch (error) {
        this.logger.error('Error adding take payment activity:', error);
      }
    } catch (error) {
      throw new HttpException(
        'Failed to create collection',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return collection;
  }
  async updateCollection(
    user: User,
    id: number,
    updates: UpdateQuery<Collection>,
  ) {
    const session = await this.conn.startSession();
    let toEmit: Collection | null = null;
    const { newOrders, ...filteredUpdates } = updates;
    let activity = null;
    try {
      await session.withTransaction(async () => {
        if (newOrders) {
          await this.updateOrders(user, newOrders, {
            session,
            deferEmit: true,
          });
        }
        const oldCollection = await this.collectionModel.findById(id);
        const collection = await this.collectionModel.findByIdAndUpdate(
          id,
          filteredUpdates,
          { new: true, session },
        );
        if (!collection) {
          throw new HttpException('Collection not found', HttpStatus.NOT_FOUND);
        }
        if (filteredUpdates.status === OrderCollectionStatus.CANCELLED) {
          // Refund points if the collection had a pointUser or pointConsumer
          if (oldCollection?.pointUser) {
            await this.pointService.refundPoint(
              oldCollection.pointUser,
              oldCollection.amount,
              collection._id,
              oldCollection.table,
              user._id,
            );
          } else if (oldCollection?.pointConsumer) {
            await this.pointService.refundPoint(
              null,
              oldCollection.amount,
              collection._id,
              oldCollection.table,
              user._id,
              oldCollection.pointConsumer,
            );
          }
          activity = await this.activityService.addActivity(
            user,
            ActivityType.CANCEL_PAYMENT,
            collection,
            { session, deferEmit: true },
          );
        }
        toEmit = collection;
      });
      if (toEmit) {
        this.websocketGateway.emitCollectionChanged(toEmit);
        this.websocketGateway.emitOrderUpdated(newOrders);
        if (activity) {
          this.websocketGateway.emitActivityChanged();
        }
      }
      return toEmit;
    } catch (error) {
      throw new HttpException(
        'Failed to update collection (transaction rolled back).',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      await session.endSession();
    }
  }

  async removeCollection(user: User, id: number) {
    const collection = await this.collectionModel.findByIdAndRemove(id);

    this.websocketGateway.emitCollectionChanged(collection);
    return collection;
  }
  // discount
  async findAllDiscounts() {
    try {
      const redisDiscounts = await this.redisService.get(RedisKeys.Discounts);
      if (redisDiscounts) {
        return redisDiscounts;
      }
    } catch (error) {
      this.logger.error('Failed to retrieve discounts from Redis:', error);
    }

    try {
      const discounts = await this.discountModel.find().exec();
      if (discounts.length > 0) {
        await this.redisService.set(RedisKeys.Discounts, discounts);
      }
      return discounts;
    } catch (error) {
      this.logger.error('Failed to retrieve discounts from database:', error);
      throw new HttpException(
        'Failed to fetch discounts',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async createDiscount(user: User, createDiscountDto: CreateDiscountDto) {
    const discount = new this.discountModel({
      ...createDiscountDto,
    });
    try {
      await discount.save();
    } catch (error) {
      throw new HttpException(
        'Failed to create discount',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    this.websocketGateway.emitDiscountChanged();
    return discount;
  }
  async updateDiscount(user: User, id: number, updates: UpdateQuery<Discount>) {
    const foundDiscount = await this.discountModel.findById(id);
    if (!foundDiscount) {
      throw new HttpException('Discount not found', HttpStatus.NOT_FOUND);
    }
    const unsetFields: Record<string, 1> = {};
    if (foundDiscount?.percentage && updates.amount) {
      unsetFields.percentage = 1;
      delete updates.percentage;
    }
    if (foundDiscount?.amount && updates.percentage) {
      unsetFields.amount = 1;
      delete updates.amount;
    }
    const updateQuery: UpdateQuery<Discount> = { ...updates };
    if (Object.keys(unsetFields).length > 0) {
      updateQuery.$unset = unsetFields;
    }
    const discount = await this.discountModel.findByIdAndUpdate(
      id,
      updateQuery,
      {
        new: true,
      },
    );

    this.websocketGateway.emitDiscountChanged();
    return discount;
  }

  async removeDiscount(user: User, id: number) {
    const orders = await this.orderModel.find({ discount: id });
    if (orders.length > 0) {
      throw new HttpException(
        'Discount is used in orders',
        HttpStatus.BAD_REQUEST,
      );
    }
    const discount = await this.discountModel.findByIdAndRemove(id);
    this.websocketGateway.emitDiscountChanged();
    return discount;
  }
  async createOrderForDivide(
    user: User,
    orders: {
      totalQuantity: number;
      selectedQuantity: number;
      orderId: number;
    }[],
  ) {
    for (const orderItem of orders) {
      const oldOrder = await this.orderModel.findById(orderItem.orderId);
      if (!oldOrder) {
        throw new HttpException('Order not found', HttpStatus.BAD_REQUEST);
      }
      // Destructure oldOrder to exclude the _id field
      const { _id, ...orderDataWithoutId } = oldOrder?.toObject();
      // Create new order without the _id field
      if (orderDataWithoutId.quantity <= 0) {
        throw new HttpException(
          'Quantity must be greater than 0',
          HttpStatus.BAD_REQUEST,
        );
      }
      const newOrder = new this.orderModel({
        ...orderDataWithoutId,
        isPaymentMade: oldOrder.paidQuantity > 0 ? true : false,
        quantity: orderItem.selectedQuantity,
        paidQuantity: 0,
        tableDate: oldOrder.tableDate ?? new Date(),
      });
      try {
        await newOrder.save();
        this.websocketGateway.emitOrderCreated(newOrder);
      } catch (error) {
        throw new HttpException(
          'Failed to create order',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      // Update the table orders
      let updatedTable;
      try {
        updatedTable = await this.tableService.updateTableOrders(
          user,
          newOrder.table,
          newOrder._id,
        );
      } catch (error) {
        // Clean up by deleting the order if updating the table fails
        await this.orderModel.findByIdAndDelete(newOrder._id);
        this.websocketGateway.emitOrderDeleted(newOrder);
        throw new HttpException(
          'Failed to update table orders',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      if (!updatedTable) {
        throw new HttpException('Table not found', HttpStatus.BAD_REQUEST);
      }
      // Update the old order
      oldOrder.quantity = orderItem.totalQuantity - orderItem.selectedQuantity;

      try {
        if (oldOrder?.quantity === 0) {
          await this.orderModel.findByIdAndDelete(oldOrder?._id);
          this.websocketGateway.emitOrderDeleted(oldOrder);
        } else {
          await oldOrder?.save();
          this.websocketGateway.emitOrderUpdated([oldOrder]);
        }
      } catch (error) {
        throw new HttpException(
          'Failed to update order',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      try {
        await this.activityService.addActivity(
          user,
          ActivityType.ORDER_DIVIDED,
          { currentOrder: oldOrder.toObject(), newOrder: newOrder.toObject() },
        );
      } catch (error) {
        this.logger.error('Failed to add activity:', error);
      }
    }
    return orders;
  }
  async createOrderForDiscount(
    user: User,
    orders: {
      totalQuantity: number;
      selectedQuantity: number;
      orderId: number;
    }[],
    discount: number,
    discountPercentage?: number,
    discountAmount?: number,
    discountNote?: string,
  ) {
    for (const orderItem of orders) {
      const oldOrder = await this.orderModel.findById(orderItem.orderId);
      if (!oldOrder) {
        throw new HttpException('Order not found', HttpStatus.BAD_REQUEST);
      }
      const totalSelectedQuantity = orders.reduce(
        (acc, order) => acc + order.selectedQuantity,
        0,
      );
      if (orderItem.selectedQuantity === orderItem.totalQuantity) {
        try {
          const updatedOrder = await this.orderModel.findByIdAndUpdate(
            orderItem.orderId,
            {
              discount: discount,
              ...(discountPercentage && {
                discountPercentage: discountPercentage,
                paidQuantity:
                  discountPercentage >= 100 ? orderItem.selectedQuantity : 0,
              }),
              ...(discountAmount && {
                discountAmount: Math.min(
                  discountAmount / totalSelectedQuantity,
                  oldOrder?.unitPrice,
                ),

                paidQuantity:
                  discountAmount / totalSelectedQuantity >= oldOrder?.unitPrice
                    ? orderItem.selectedQuantity
                    : 0,
              }),
              discountNote: discountNote ?? '',
            },
            { new: true },
          );
          await this.activityService.addActivity(
            user,
            ActivityType.ORDER_DISCOUNT,
            updatedOrder,
          );
          this.websocketGateway.emitOrderUpdated([updatedOrder]);
        } catch (error) {
          throw new HttpException(
            'Failed to update order',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      } else {
        // Destructure oldOrder to exclude the _id field
        const { _id, ...orderDataWithoutId } = oldOrder?.toObject();
        // Create new order without the _id field
        if (orderDataWithoutId.quantity <= 0) {
          throw new HttpException(
            'Quantity must be greater than 0',
            HttpStatus.BAD_REQUEST,
          );
        }
        const newOrder = new this.orderModel({
          ...orderDataWithoutId,
          quantity: orderItem.selectedQuantity,
          discount: discount,
          tableDate: oldOrder.tableDate ?? new Date(),
          ...(discountPercentage && {
            discountPercentage: discountPercentage,
            paidQuantity:
              discountPercentage >= 100 ? orderItem.selectedQuantity : 0,
          }),
          ...(discountAmount && {
            discountAmount: Math.min(
              discountAmount / totalSelectedQuantity,
              oldOrder?.unitPrice,
            ),
            paidQuantity:
              discountAmount / totalSelectedQuantity >= oldOrder?.unitPrice
                ? orderItem.selectedQuantity
                : 0,
          }),
          discountNote: discountNote ?? '',
        });
        try {
          await newOrder.save();
          await this.activityService.addActivity(
            user,
            ActivityType.ORDER_DISCOUNT,
            newOrder,
          );
          this.websocketGateway.emitOrderCreated(newOrder);
        } catch (error) {
          throw new HttpException(
            'Failed to create order',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        // Update the table orders
        let updatedTable;
        try {
          updatedTable = await this.tableService.updateTableOrders(
            user,
            newOrder.table,
            newOrder._id,
          );
        } catch (error) {
          // Clean up by deleting the order if updating the table fails
          await this.orderModel.findByIdAndDelete(newOrder._id);
          this.websocketGateway.emitOrderDeleted(newOrder);
          throw new HttpException(
            'Failed to update table orders',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        if (!updatedTable) {
          throw new HttpException('Table not found', HttpStatus.BAD_REQUEST);
        }
        // Update the old order
        const newQuantity =
          orderItem.totalQuantity - orderItem.selectedQuantity;

        if (newQuantity < 0) {
          throw new HttpException(
            'Invalid quantity calculation',
            HttpStatus.BAD_REQUEST,
          );
        }

        try {
          if (newQuantity === 0) {
            await this.orderModel.findByIdAndDelete(oldOrder._id);
            this.websocketGateway.emitOrderDeleted(oldOrder);
          } else {
            oldOrder.quantity = newQuantity;
            await oldOrder.save();
            this.websocketGateway.emitOrderUpdated([oldOrder]);
          }
        } catch (error) {
          throw new HttpException(
            'Failed to update order',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }
    }
    return orders;
  }
  async cancelDiscountForOrder(
    user: User,
    orderId: number,
    cancelQuantity: number,
  ) {
    const order = await this.orderModel.findById(orderId);
    this.activityService.addActivity(
      user,
      ActivityType.ORDER_DISCOUNT_CANCEL,
      order,
    );
    if (!order) {
      throw new HttpException('Order not found', HttpStatus.BAD_REQUEST);
    }
    if (order.quantity === cancelQuantity) {
      const updatedOrder = { ...order.toObject() } as Order;
      delete updatedOrder.discount;
      delete updatedOrder.discountPercentage;
      delete updatedOrder.discountAmount;
      delete updatedOrder.discountNote;

      try {
        await this.orderModel.findByIdAndUpdate(
          orderId,
          {
            $set: updatedOrder,
            $unset: {
              discount: '',
              discountPercentage: '',
              discountAmount: '',
              discountNote: '',
            },
          },
          { new: true },
        );
        this.websocketGateway.emitOrderUpdated([updatedOrder]);
      } catch (error) {
        throw new HttpException(
          'Failed to update order',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    } else {
      const { _id, ...orderDataWithoutId } = order.toObject();
      if (orderDataWithoutId.quantity <= 0) {
        throw new HttpException(
          'Quantity must be greater than 0',
          HttpStatus.BAD_REQUEST,
        );
      }
      const newOrder = new this.orderModel({
        ...orderDataWithoutId,
        quantity: cancelQuantity,
        paidQuantity: 0,
        discount: undefined,
        discountPercentage: undefined,
        discountAmount: undefined,
        discountNote: undefined,
        tableDate: order.tableDate ?? new Date(),
      });
      try {
        await newOrder.save();
        this.websocketGateway.emitOrderCreated(newOrder);
      } catch (error) {
        throw new HttpException(
          'Failed to create order',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Update the table orders
      let updatedTable;
      try {
        updatedTable = await this.tableService.updateTableOrders(
          user,
          newOrder.table,
          newOrder._id,
        );
      } catch (error) {
        // Clean up by deleting the order if updating the table fails
        await this.orderModel.findByIdAndDelete(newOrder._id);
        this.websocketGateway.emitOrderDeleted(newOrder);
        throw new HttpException(
          'Failed to update table orders',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      if (!updatedTable) {
        throw new HttpException('Table not found', HttpStatus.BAD_REQUEST);
      }
      // Update the old order
      const newQuantity = order.quantity - cancelQuantity;

      if (newQuantity < 0) {
        throw new HttpException(
          'Invalid quantity calculation',
          HttpStatus.BAD_REQUEST,
        );
      }

      try {
        if (newQuantity === 0) {
          await this.orderModel.findByIdAndDelete(order._id);
          this.websocketGateway.emitOrderDeleted(order);
        } else {
          order.quantity = newQuantity;
          await order.save();
          this.websocketGateway.emitOrderUpdated([order]);
        }
      } catch (error) {
        throw new HttpException(
          'Failed to update order',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
    return order;
  }
  async selectedOrderTransfer(
    user: User,
    orders: {
      totalQuantity: number;
      selectedQuantity: number;
      orderId: number;
    }[],
    transferredTableId: number,
  ) {
    for (const orderItem of orders) {
      if (orderItem.selectedQuantity <= 0) {
        continue;
      }
      const oldOrder = await this.orderModel.findById(orderItem.orderId);
      const oldTable = await this.tableService.getTableById(oldOrder.table);
      if (!oldOrder) {
        throw new HttpException('Order not found', HttpStatus.BAD_REQUEST);
      }
      if (
        oldOrder.paidQuantity > 0 &&
        oldOrder.paidQuantity + orderItem.selectedQuantity > oldOrder.quantity
      ) {
        throw new HttpException(
          'Cannot transfer more than unpaid quantity',
          HttpStatus.BAD_REQUEST,
        );
      }

      // order total is transferred
      if (orderItem.selectedQuantity === orderItem.totalQuantity) {
        const oldTable = await this.tableService.getTableById(oldOrder.table);
        if (!oldTable) {
          throw new HttpException('Table not found', HttpStatus.BAD_REQUEST);
        }
        const newTable = await this.tableService.getTableById(
          transferredTableId,
        );
        if (!newTable) {
          throw new HttpException('Table not found', HttpStatus.BAD_REQUEST);
        }
        oldTable.orders = oldTable.orders.filter(
          (tableOrder) => tableOrder == oldOrder._id,
        );

        newTable.orders.push(oldOrder._id);
        oldOrder.table = transferredTableId;
        try {
          await Promise.all([
            oldTable.save(),
            newTable.save(),
            oldOrder.save(),
          ]);
          this.websocketGateway.emitOrderUpdated([oldOrder]);
          this.websocketGateway.emitSingleTableChanged(
            pick(oldTable, ['orders', '_id', 'date', 'location']),
          );
        } catch (error) {
          throw new HttpException(
            'Failed to transfer order',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }
      // order partially transferred
      else {
        if (oldOrder.paidQuantity > 0) {
          oldOrder.quantity = oldOrder.quantity - orderItem.selectedQuantity;
          const newOrder = new this.orderModel({
            ...oldOrder.toObject(),
            paidQuantity: 0,
            quantity: orderItem.selectedQuantity,
            table: transferredTableId,
            tableDate: oldOrder.tableDate ?? new Date(),
          });
          await newOrder.save();
          const newTable = await this.tableService.getTableById(
            transferredTableId,
          );
          if (!newTable) {
            throw new HttpException('Table not found', HttpStatus.BAD_REQUEST);
          }
          newTable.orders.push(newOrder._id);
          await Promise.all([newTable.save(), oldOrder.save()]);
          this.websocketGateway.emitOrderUpdated([oldOrder]);
          this.websocketGateway.emitOrderCreated(newOrder);
          this.websocketGateway.emitSingleTableChanged(
            pick(oldTable, ['orders', '_id', 'date', 'location']),
          );
          this.websocketGateway.emitSingleTableChanged(
            pick(newTable, ['orders', '_id', 'date', 'location']),
          );
          continue;
        }
        // Destructure oldOrder to exclude the _id field
        const { _id, ...orderDataWithoutId } = oldOrder?.toObject();
        // Create new order without the _id field
        if (orderDataWithoutId.quantity <= 0) {
          throw new HttpException(
            'Quantity must be greater than 0',
            HttpStatus.BAD_REQUEST,
          );
        }
        const newOrder = new this.orderModel({
          ...orderDataWithoutId,
          quantity: orderItem.selectedQuantity,
          tableDate: oldOrder.tableDate ?? new Date(),
        });
        const newTable = await this.tableService.getTableById(
          transferredTableId,
        );
        if (!newTable) {
          throw new HttpException('Table not found', HttpStatus.BAD_REQUEST);
        }
        await newOrder.save();
        newTable.orders.push(newOrder._id);
        oldOrder.quantity =
          orderItem.totalQuantity - orderItem.selectedQuantity;
        oldOrder.table = transferredTableId;
        try {
          await Promise.all([newTable.save(), oldOrder.save()]);
          this.websocketGateway.emitOrderUpdated([oldOrder]);
          this.websocketGateway.emitSingleTableChanged(
            pick(oldTable, ['orders', '_id', 'date', 'location']),
          );
          this.websocketGateway.emitSingleTableChanged(
            pick(newTable, ['orders', '_id', 'date', 'location']),
          );
        } catch (error) {
          throw new HttpException(
            'Failed to transfer order',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }
    }
  }
  async tableCombine(
    user: User,
    orders: Order[],
    oldTableId: number,
    transferredTableId: number,
  ) {
    const oldTable = await this.tableService.getTableById(oldTableId);
    if (!oldTable) {
      throw new HttpException('Old table not found', HttpStatus.BAD_REQUEST);
    }

    const newTable = await this.tableService.getTableById(transferredTableId);
    if (!newTable) {
      throw new HttpException('New table not found', HttpStatus.BAD_REQUEST);
    }

    for (const order of orders) {
      oldTable.orders = oldTable.orders.filter(
        (tableOrder) => tableOrder.toString() !== order._id.toString(),
      );
      newTable.orders.push(order._id);
      await this.updateOrder(user, order._id, { table: transferredTableId });
    }
    const collections = await this.collectionModel.find({ table: oldTableId });
    for (const collection of collections) {
      collection.table = transferredTableId;
      await collection.save();
    }

    newTable.gameplays = [
      ...new Set([...newTable.gameplays, ...oldTable.gameplays]),
    ];

    try {
      await Promise.all([newTable.save()]);
      await this.tableService.removeTable(oldTableId, user);
      for (const order of orders) {
        this.websocketGateway.emitOrderUpdated(orders);
      }
    } catch (error) {
      this.logger.error('Error in order operation:', error);
      throw new HttpException(
        'Failed to transfer orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return orders;
  }

  async tableTransfer(
    user: User,
    orders: Order[],
    oldTableId: number,
    transferredTableName: string,
  ) {
    const oldTable = await this.tableService.getTableById(oldTableId);
    if (!oldTable) {
      throw new HttpException('Old table not found', HttpStatus.BAD_REQUEST);
    }
    const newTable = await this.tableService.create(user, {
      ...oldTable.toObject(),
      isAutoEntryAdded: false,
      name: transferredTableName,
    });
    if (!newTable) {
      throw new HttpException('New table not found', HttpStatus.BAD_REQUEST);
    }
    for (const order of orders) {
      oldTable.orders = oldTable.orders.filter(
        (tableOrder) => tableOrder.toString() !== order._id.toString(),
      );
      newTable.orders.push(order._id);
      await this.updateOrder(user, order._id, { table: newTable._id });
    }
    const collections = await this.collectionModel.find({ table: oldTableId });
    for (const collection of collections) {
      collection.table = newTable._id;
      await collection.save();
    }

    try {
      await Promise.all([newTable.save()]);
      await this.tableService.removeTable(oldTableId, user);
      this.websocketGateway.emitOrderUpdated(orders);
    } catch (error) {
      this.logger.error('Error in order operation:', error);
      throw new HttpException(
        'Failed to transfer orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return orders;
  }

  async updateOrderTableDates() {
    try {
      // Fetch orders with necessary fields
      const startDate = new Date('2025-01-01T00:00:00Z');

      // Fetch orders with necessary fields created after January 1, 2025
      const orders = await this.orderModel
        .find({
          createdAt: { $gte: startDate },
        })
        .populate({
          path: 'table',
          select: 'date', // Only fetch the 'date' field from the 'table' document
        });

      for (const order of orders) {
        // Convert date to Europe/Istanbul timezone, or use UTC as a fallback
        order.tableDate = isPopulatedTable(order.table)
          ? new Date(order.table.date)
          : order.createdAt; // Convert createdAt to Date object directly

        await order.save();
      }

      // Fetch collections with necessary fields
      const collections = await this.collectionModel
        .find({
          createdAt: { $gte: startDate },
        })
        .populate({
          path: 'table',
          select: 'date',
        });

      for (const collection of collections) {
        // Similarly, handle dates for collections
        collection.tableDate = isPopulatedTable(collection.table)
          ? new Date(collection.table.date)
          : collection.createdAt; // Use createdAt as Date object

        await collection.save();
      }
    } catch (error) {
      this.logger.error('Failed to update table dates:', error);
      throw new HttpException(
        'Failed to update table dates',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async updateLocationForOrdersWithIkasId() {
    try {
      const updateResult = await this.orderModel.updateMany(
        { ikasId: { $exists: true } },
        { $set: { location: 6 } },
      );
      await this.collectionModel.updateMany(
        { ikasId: { $exists: true } },
        { $set: { location: 6 } },
      );

      return updateResult;
    } catch (error) {
      this.logger.error('Error updating orders with ikasId:', error);
      throw error; // Or handle it more gracefully as needed
    }
  }

  async migrateOnline() {
    const MARKETPLACES = [
      'trendyol',
      'shopier',
      'hepsiburada',
      'amazon',
      'kutuoyunual',
    ];
    try {
      const result = await this.orderModel.updateMany(
        {
          $or: [{ location: 6 }, { paymentMethod: { $in: MARKETPLACES } }],
        },
        { $set: { location: 4 } },
      );
      const collectionResult = await this.collectionModel.updateMany(
        {
          $or: [{ location: 6 }, { paymentMethod: { $in: MARKETPLACES } }],
        },
        { $set: { location: 4 } },
      );
      await this.websocketGateway.emitOrderUpdated([]);
      await this.websocketGateway.emitCollectionChanged(null);
      return {
        matchedOrders: result.matchedCount,
        modifiedOrders: result.modifiedCount,
        matchedCollections: collectionResult.matchedCount,
        modifiedCollections: collectionResult.modifiedCount,
      };
    } catch (error) {
      this.logger.error('Error migrating orders to online:', error);
      throw error;
    }
  }
  async migrateOnlineTableOrders() {
    const onlineTables = await this.tableService.findOnlineTables();
    if (!onlineTables || onlineTables?.length === 0) {
      throw new HttpException('No online tables found', HttpStatus.NOT_FOUND);
    }
    const tableIds = onlineTables.map((table) => table._id);
    try {
      const result = await this.orderModel.updateMany(
        { table: { $in: tableIds } },
        { $set: { location: 4 } },
      );
      await this.websocketGateway.emitOrderUpdated([]);
      return {
        matchedOrders: result.matchedCount,
        modifiedOrders: result.modifiedCount,
      };
    } catch (error) {
      this.logger.error('Error migrating orders to online:', error);
      throw error;
    }
  }
  async findDailySummary(date: string, location: number) {
    try {
      const [
        topOrderCreators,
        topOrderDeliverers,
        topCollectionCreators,
        orderPreparationStats,
        buttonCallStats,
        gameplayStats,
      ] = await Promise.all([
        this.findTopOrderCreators(date, location),
        this.findTopOrderDeliverers(date, location),
        this.findTopCollectionCreators(date, location),
        this.findOrderPreparationStats(date, location),
        this.buttonCallService.averageButtonCallStats(date, location),
        this.gameplayService.givenDateTopMentorAndComplexGames(date, location),
      ]);
      return {
        topOrderCreators,
        topOrderDeliverers,
        topCollectionCreators,
        orderPreparationStats,
        buttonCallStats,
        gameplayStats,
      };
    } catch (error) {
      this.logger.error('Error getting daily summary:', error);
      throw error;
    }
  }
  findOrderNotes() {
    return this.orderNotesModel.find().exec();
  }
  findByIkasId(ikasId: string) {
    return this.orderModel.findOne({ ikasId: ikasId }).exec();
  }

  findByShopifyOrderLineItemId(shopifyOrderLineItemId: string) {
    return this.orderModel.findOne({ shopifyOrderLineItemId }).exec();
  }

  /**
   * Update order by ID without triggering additional side effects
   * Used internally to avoid circular dependencies
   */
  async updateOrderByIdDirect(
    id: number,
    updates: Partial<Order>,
  ): Promise<Order> {
    const order = await this.orderModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    if (!order) {
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    }
    this.websocketGateway.emitOrderUpdated([order]);
    return order;
  }

  findByTrendyolLineItemId(trendyolLineItemId: string) {
    return this.orderModel.findOne({ trendyolLineItemId }).exec();
  }

  findByTrendyolShipmentPackageId(trendyolShipmentPackageId: string) {
    return this.orderModel
      .find({ trendyolShipmentPackageId })
      .populate('item')
      .exec();
  }

  findCollectionByTrendyolShipmentPackageId(
    trendyolShipmentPackageId: string,
  ) {
    return this.collectionModel
      .findOne({ trendyolShipmentPackageId })
      .exec();
  }

  findByShopifyIdAndItem(shopifyId: string, itemId: number) {
    return this.orderModel
      .findOne({ shopifyId: shopifyId, item: itemId })
      .exec();
  }

  async createOrderNote(createOrderNoteDto: CreateOrderNotesDto) {
    const orderNote = await new this.orderNotesModel(createOrderNoteDto);
    await this.websocketGateway.emitOrderNotesChanged();
    return orderNote.save();
  }
  async updateOrderNote(
    id: number,
    updateOrderNoteDto: UpdateQuery<OrderNotes>,
  ) {
    const orderNote = await this.orderNotesModel.findByIdAndUpdate(
      id,
      updateOrderNoteDto,
      { new: true },
    );
    if (!orderNote) {
      throw new HttpException('Order note not found', HttpStatus.NOT_FOUND);
    }
    this.websocketGateway.emitOrderNotesChanged();
    return orderNote;
  }
  async removeOrderNote(id: number) {
    const orderNote = await this.orderNotesModel.findByIdAndRemove(id);
    if (!orderNote) {
      throw new HttpException('Order note not found', HttpStatus.NOT_FOUND);
    }
    this.websocketGateway.emitOrderNotesChanged();
    return orderNote;
  }
  async removeZeroQuantityOrders() {
    try {
      const result = await this.orderModel.deleteMany({
        quantity: 0,
      });

      return {
        message: 'Successfully removed orders with 0 quantity',
        deletedCount: result.deletedCount,
      };
    } catch (error) {
      this.logger.error('Error removing zero quantity orders:', error);
      throw new HttpException(
        'Failed to remove zero quantity orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async dedupeIkasDuplicates(options?: { sinceOnly?: Date; dryRun?: boolean }) {
    const sinceOnly = options?.sinceOnly;
    const dryRun = !!options?.dryRun;

    const matchStage: Record<string, unknown> = {
      ikasId: { $exists: true, $ne: null },
    };
    if (sinceOnly) matchStage.createdAt = { $gte: sinceOnly };

    const dupGroups = await this.orderModel.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$ikasId',
          orderIds: { $push: '$_id' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: 1 } },
    ]);

    if (dupGroups.length === 0) {
      return { ok: true, message: 'No duplicate ikasId groups found.' };
    }
    const session = await this.conn.startSession();
    const results = {
      groupsProcessed: 0,
      ordersDeleted: 0,
      collectionsDeleted: 0,
      collectionsRewired: 0,
      survivors: [] as Array<{
        ikasId: string;
        survivorOrder: number;
        keptCollection?: number;
      }>,
      dryRun,
    };

    try {
      await session.withTransaction(async () => {
        for (const g of dupGroups) {
          const ikasId: string = g._id;
          const orderIds: number[] = g.orderIds;

          const orders = await this.orderModel
            .find({ _id: { $in: orderIds } })
            .select('_id createdAt')
            .sort({ createdAt: 1 })
            .session(session);

          const collections = await this.collectionModel
            .find({ 'orders.order': { $in: orderIds } })
            .session(session);

          const referencedOrderIds = new Set<number>();
          for (const c of collections) {
            for (const oi of c.orders ?? []) {
              if (orderIds.includes(oi.order)) referencedOrderIds.add(oi.order);
            }
          }

          let survivorOrderId: number | null = null;
          if (referencedOrderIds.size > 0) {
            const earliestReferenced = orders.find((o) =>
              referencedOrderIds.has(o._id as number),
            );
            survivorOrderId = earliestReferenced?._id as number;
          } else {
            survivorOrderId = orders[0]?._id as number;
          }
          if (survivorOrderId == null) continue;

          const survivorCollections = collections.filter((c) =>
            (c.orders ?? []).some((oi) => oi.order === survivorOrderId),
          );

          let keptCollection: Collection | null = null;

          if (survivorCollections.length > 0) {
            keptCollection = survivorCollections.sort(
              (a, b) =>
                (a.createdAt?.getTime?.() ?? 0) -
                (b.createdAt?.getTime?.() ?? 0),
            )[0];
          } else if (collections.length > 0) {
            keptCollection = collections.sort(
              (a, b) =>
                (a.createdAt?.getTime?.() ?? 0) -
                (b.createdAt?.getTime?.() ?? 0),
            )[0];

            if (!dryRun && keptCollection) {
              const existingIdx = keptCollection.orders.findIndex(
                (oi) => oi.order === survivorOrderId,
              );
              const dupIdxs = keptCollection.orders
                .map((oi, idx) => ({ oi, idx }))
                .filter(
                  ({ oi }) =>
                    orderIds.includes(oi.order) && oi.order !== survivorOrderId,
                )
                .map(({ idx }) => idx);

              if (existingIdx === -1) {
                if (dupIdxs.length > 0) {
                  const firstIdx = dupIdxs[0];
                  keptCollection.orders[firstIdx].order = survivorOrderId;
                  for (let i = dupIdxs.length - 1; i >= 1; i--) {
                    keptCollection.orders.splice(dupIdxs[i], 1);
                  }
                } else {
                  keptCollection.orders.push({
                    order: survivorOrderId,
                    paidQuantity: 0,
                  });
                }
              } else {
                let addPQ = 0;
                for (const idx of dupIdxs)
                  addPQ += keptCollection.orders[idx].paidQuantity || 0;
                keptCollection.orders[existingIdx].paidQuantity =
                  (keptCollection.orders[existingIdx].paidQuantity || 0) +
                  addPQ;
                for (let i = dupIdxs.length - 1; i >= 0; i--) {
                  keptCollection.orders.splice(dupIdxs[i], 1);
                }
              }

              await keptCollection.save({ session });
              results.collectionsRewired += 1;
            }
          }

          const collectionsToDelete = collections.filter(
            (c) => !keptCollection || c._id !== keptCollection._id,
          );
          if (!dryRun && collectionsToDelete.length > 0) {
            const delRes = await this.collectionModel.deleteMany(
              { _id: { $in: collectionsToDelete.map((c) => c._id) } },
              { session },
            );
            results.collectionsDeleted += delRes.deletedCount || 0;
          }

          if (!dryRun && keptCollection) {
            await this.collectionModel.updateOne(
              { _id: keptCollection._id },
              {
                $pull: {
                  orders: {
                    order: {
                      $in: orderIds.filter((id) => id !== survivorOrderId),
                    },
                  },
                },
              },
              { session },
            );
          }

          const ordersToDelete = orderIds.filter(
            (id) => id !== survivorOrderId,
          );
          if (!dryRun && ordersToDelete.length > 0) {
            await this.collectionModel.updateMany(
              { 'orders.order': { $in: ordersToDelete } },
              { $pull: { orders: { order: { $in: ordersToDelete } } } },
              { session },
            );
            const delRes = await this.orderModel.deleteMany(
              { _id: { $in: ordersToDelete } },
              { session },
            );
            results.ordersDeleted += delRes.deletedCount || 0;
          }

          results.groupsProcessed += 1;
          results.survivors.push({
            ikasId,
            survivorOrder: survivorOrderId,
            keptCollection: keptCollection
              ? (keptCollection._id as number)
              : undefined,
          });
        }
      });

      return { ok: true, ...results };
    } catch (err) {
      throw new HttpException(
        `Failed to dedupe ikas duplicates: ${err?.message || err}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    } finally {
      await session.endSession();
    }
  }

  // Helper: Günlük data array oluşturma (label'sız - frontend oluşturacak)
  private createDailyDataArray(
    startDate: Date,
    endDate: Date,
    aggregatedData: Map<string, number>,
  ) {
    const result = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const dateStr = format(current, 'yyyy-MM-dd');

      result.push({
        date: dateStr,
        total: aggregatedData.get(dateStr) || 0,
      });

      current.setDate(current.getDate() + 1);
    }

    return result;
  }

  // Helper: Aylık data array oluşturma (label'sız - frontend oluşturacak)
  private createMonthlyDataArray(
    startDate: Date,
    endDate: Date,
    aggregatedData: Map<string, number>,
  ) {
    const result = [];
    const current = new Date(startDate);
    current.setDate(1); // Ayın ilk günü

    while (current <= endDate) {
      const monthStr = format(current, 'yyyy-MM');

      result.push({
        month: monthStr,
        total: aggregatedData.get(monthStr) || 0,
      });

      current.setMonth(current.getMonth() + 1);
    }

    return result;
  }

  // Ana method
  async categorySummaryCompare(params: {
    primaryAfter: string;
    primaryBefore: string;
    secondaryAfter: string;
    secondaryBefore: string;
    granularity: 'daily' | 'monthly';
    location?: number;
    upperCategory?: number;
    category?: number;
  }) {
    const {
      primaryAfter,
      primaryBefore,
      secondaryAfter,
      secondaryBefore,
      granularity,
      location,
      upperCategory,
      category,
    } = params;

    // Validation
    if (
      !primaryAfter ||
      !primaryBefore ||
      !secondaryAfter ||
      !secondaryBefore
    ) {
      throw new HttpException(
        'Missing required date parameters',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // Kategori filtreleme
      let categoryFilter = {};

      if (category) {
        // Alt kategori - menuitems'daki category alanı ile filtrele
        categoryFilter = { 'itemDetails.category': Number(category) };
      } else if (upperCategory) {
        // Üst kategori - alt kategorileri bul
        const foundUpperCategory =
          await this.menuService.findSingleUpperCategory(Number(upperCategory));
        const categoryIds = foundUpperCategory?.categoryGroup?.map(
          (cg) => cg?.category,
        );
        if (categoryIds && categoryIds.length > 0) {
          // itemDetails lookup gerekiyor
          categoryFilter = {
            'itemDetails.category': { $in: categoryIds },
          };
        }
      }

      // Primary period data
      const primaryData = await this.aggregateOrderData(
        primaryAfter,
        primaryBefore,
        granularity,
        location,
        categoryFilter,
      );

      // Secondary period data
      const secondaryData = await this.aggregateOrderData(
        secondaryAfter,
        secondaryBefore,
        granularity,
        location,
        categoryFilter,
      );

      // Data'yı period formatına çevir
      const primaryPeriod = this.formatPeriodData(
        primaryAfter,
        primaryBefore,
        granularity,
        primaryData,
      );

      const secondaryPeriod = this.formatPeriodData(
        secondaryAfter,
        secondaryBefore,
        granularity,
        secondaryData,
      );

      // Karşılaştırma metrikleri
      const primaryTotal = primaryPeriod.totalRevenue;
      const secondaryTotal = secondaryPeriod.totalRevenue;
      const absoluteChange = primaryTotal - secondaryTotal;
      const percentageChange =
        secondaryTotal !== 0 ? (absoluteChange / secondaryTotal) * 100 : 0;

      return {
        primaryPeriod,
        secondaryPeriod,
        comparisonMetrics: {
          percentageChange,
          absoluteChange,
        },
      };
    } catch (err) {
      throw new HttpException(
        `Failed to fetch category summary comparison: ${err?.message || err}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Aggregate order data
  private async aggregateOrderData(
    startDate: string,
    endDate: string,
    granularity: 'daily' | 'monthly',
    location?: number,
    categoryFilter?: any,
  ): Promise<Map<string, number>> {
    const matchStage: any = {
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000),
      },
      status: { $nin: ['cancelled', 'returned', 'wasted'] },
    };

    if (location && Number(location) !== 0) {
      matchStage.location = Number(location);
    }

    // Kategori filtresi için itemDetails lookup gerekebilir
    const needsLookup =
      categoryFilter && categoryFilter['itemDetails.category'];

    const pipeline: PipelineStage[] = [];

    // Lookup ekle (eğer category veya upperCategory varsa)
    if (needsLookup) {
      pipeline.push({
        $lookup: {
          from: 'menuitems',
          localField: 'item',
          foreignField: '_id',
          as: 'itemDetails',
        },
      });
      pipeline.push({
        $unwind: {
          path: '$itemDetails',
          preserveNullAndEmptyArrays: true,
        },
      });
    }

    // Match stage
    const fullMatchStage = { ...matchStage, ...categoryFilter };
    pipeline.push({ $match: fullMatchStage });

    // Gelir hesaplama
    pipeline.push({
      $addFields: {
        revenue: {
          $subtract: [
            { $multiply: ['$paidQuantity', '$unitPrice'] },
            {
              $add: [
                { $ifNull: ['$discountAmount', 0] },
                {
                  $divide: [
                    {
                      $multiply: [
                        { $multiply: ['$unitPrice', '$paidQuantity'] },
                        { $ifNull: ['$discountPercentage', 0] },
                      ],
                    },
                    100,
                  ],
                },
              ],
            },
          ],
        },
      },
    });

    // Granularity'ye göre gruplama
    if (granularity === 'daily') {
      pipeline.push({
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          total: { $sum: '$revenue' },
        },
      });
    } else {
      // monthly
      pipeline.push({
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m', date: '$createdAt' },
          },
          total: { $sum: '$revenue' },
        },
      });
    }

    pipeline.push({ $sort: { _id: 1 } });

    const results = await this.orderModel.aggregate(pipeline);

    // Map'e çevir
    const dataMap = new Map<string, number>();
    results.forEach((item) => {
      dataMap.set(item._id, item.total);
    });

    return dataMap;
  }

  // Period data formatla (label'sız - frontend oluşturacak)
  private formatPeriodData(
    startDateStr: string,
    endDateStr: string,
    granularity: 'daily' | 'monthly',
    aggregatedData: Map<string, number>,
  ) {
    const startDate = parseISO(startDateStr);
    const endDate = parseISO(endDateStr);

    let data: any[];
    if (granularity === 'daily') {
      data = this.createDailyDataArray(startDate, endDate, aggregatedData);
    } else {
      data = this.createMonthlyDataArray(startDate, endDate, aggregatedData);
    }

    const totalRevenue = data.reduce((sum, item) => sum + item.total, 0);

    return {
      granularity,
      startDate: startDateStr,
      endDate: endDateStr,
      data,
      totalRevenue,
    };
  }
}
