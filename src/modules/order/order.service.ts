import { InjectQueue } from '@nestjs/bull';
import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
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
  OrderType,
  SummaryCollectionQueryDto,
} from './order.dto';
import { Order } from './order.schema';
import { OrderGroup } from './orderGroup.schema';
import { OrderNotes } from './orderNotes.schema';
interface SeenUsers {
  [key: string]: boolean;
}
@Injectable()
export class OrderService {
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

    @Inject(forwardRef(() => GameplayService))
    private readonly gameplayService: GameplayService,

    @Inject(forwardRef(() => PointService))
    private readonly pointService: PointService,
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
      console.warn('Could not read popular discounts from Redis:', err);
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
      console.warn('Could not write popular discounts to Redis:', err);
    }

    return result;
  }
  async findQueryOrders(query: OrderQueryDto) {
    const filterQuery: Record<string, any> = {
      quantity: { $gt: 0 },
    };
    const { after, before, category, location, isIkasPickUp, item } = query;
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
        ...(filterQuery.tableDate ?? {}),
        $lte: endUtc,
      };
    }
    const filterKeys = [
      'discount',
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
    const filterQuery: any = {};
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
    const filterQuery: any = {};
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
        topOrders: stats.topOrders.map((o: any) => ({
          order: o,
          ms: o.preparationTimeMs,
          formatted: formatDuration(o.preparationTimeMs),
        })),
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
    const kitchenSoundRoles = new Set<number>();
    const kitchenSelectedUsers = new Set<string>();
    for (const order of orders) {
      if (order.quantity <= 0) {
        continue;
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
          { path: 'kitchen' },
          {
            path: 'table',
            select: 'date _id name isOnlineSale finishHour type startHour',
          },
        ]);
        if (
          (orderWithItem?.kitchen as any)?.soundRoles &&
          createdOrder.status !== OrderStatus.AUTOSERVED &&
          createdOrder.status !== OrderStatus.SERVED
        ) {
          if ((orderWithItem?.kitchen as any)?.selectedUsers) {
            (orderWithItem?.kitchen as any)?.selectedUsers.forEach(
              (userId: string) => {
                kitchenSelectedUsers.add(userId);
              },
            );
          }
          (orderWithItem?.kitchen as any)?.soundRoles.forEach(
            (role: number) => {
              kitchenSoundRoles.add(role);
            },
          );
        }
        for (const ingredient of (orderWithItem.item as any).itemProduction) {
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
      } catch (error) {
        console.log(error);
        throw new HttpException(
          'Failed to create order',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      // update table
      let updatedTable;
      try {
        updatedTable = await this.tableService.updateTableOrders(
          user,
          table._id,
          createdOrders,
        );
      } catch (error) {
        throw new HttpException(
          'Failed to update table orders',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      if (!updatedTable) {
        throw new HttpException('Table not found', HttpStatus.BAD_REQUEST);
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
      Array.from(kitchenSoundRoles),
      Array.from(kitchenSelectedUsers),
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

    // Check if table is closed (finishHour exists)
    if (createOrderDto.table) {
      const table = await this.tableService.findById(createOrderDto.table);
      if (table && table.finishHour) {
        throw new HttpException(
          'Cannot add orders to a closed table',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const order = new this.orderModel({
      ...createOrderDto,
      status: createOrderDto?.status ?? 'pending',
      createdBy: createOrderDto?.createdBy ?? user._id,
      createdAt: new Date(),
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

      for (const ingredient of (orderWithItem.item as any).itemProduction) {
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
      try {
        await this.activityService.addActivity(
          users.find((user) => user._id === order.createdBy),
          ActivityType.CREATE_ORDER,
          order,
        );
      } catch (error) {
        console.error('Error adding create order activity:', error);
      }
      if (order.discount) {
        try {
          await this.activityService.addActivity(
            user,
            ActivityType.ORDER_DISCOUNT,
            order,
          );
        } catch (error) {
          console.error('Error adding order discount activity:', error);
        }
      }
      if (order?.table) {
        try {
          this.websocketGateway.emitOrderCreated(user, order);
        } catch (error) {
          console.error('Error emitting order created:', error);
        }
      }
    } catch (error) {
      throw new HttpException(
        'Failed to create order',
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
        this.websocketGateway.emitOrderUpdated(user, order);
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
              if (visit?.user && !acc.seenUsers[(visit as any).user]) {
                acc.seenUsers[(visit as any).user] = true;
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
          brand: (order?.kitchen as any)?.name,
          product: (order.item as any).name,
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
      for (const ingredient of (populatedReturnOrder?.item as any)
        .itemProduction) {
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
      this.websocketGateway.emitOrderCreated(user, returnOrder);
      return returnOrder;
    } catch (error) {
      console.error('Error in returnOrder:', error);
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

      if (updates?.status === OrderStatus.CANCELLED) {
        for (const ingredient of (oldOrder?.item as any).itemProduction) {
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
        ].includes(updates?.status)
      ) {
        for (const ingredient of (oldOrder?.item as any).itemProduction) {
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
      if (oldOrder?.quantity < updates?.quantity) {
        for (const ingredient of (oldOrder?.item as any).itemProduction) {
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
      } else if (updates?.quantity < oldOrder?.quantity) {
        for (const ingredient of (oldOrder?.item as any).itemProduction) {
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
          this.websocketGateway.emitOrderUpdated(user, order);
          return order;
        });
    } else {
      return this.orderModel
        .findByIdAndUpdate(id, updates, {
          new: true,
        })
        .then((order) => {
          this.websocketGateway.emitOrderUpdated(user, order);
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
      this.websocketGateway.emitOrderUpdated(user, order);
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
        const newOrder = await this.orderModel.create({
          ...order.toObject(),
          quantity: newQuantity,
          paidQuantity: newQuantity,
        });
        const newCollection = await this.collectionModel.create({
          ...collection.toObject(),
          orders: [
            {
              order: newOrder._id,
              paidQuantity: newQuantity,
            },
          ],
        });
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
        for (const ingredient of (order?.item as any).itemProduction) {
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
        for (const ingredient of (order?.item as any).itemProduction) {
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
      await this.websocketGateway.emitOrderUpdated(user, order);
      await this.websocketGateway.emitCollectionChanged(user, collection);
      return { message: 'Order cancelled successfully' };
    } catch (error) {
      console.error('Error cancelling ikas order:', error);
      throw new HttpException(
        'Failed to cancel order',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
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
      this.websocketGateway.emitTodayOrderChanged();
    } catch (error) {
      console.error('Error updating orders:', error);
      throw new HttpException(
        'Failed to update some orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async updateOrders(
    user: User,
    orders: OrderType[],
    opts?: { session?: ClientSession; deferEmit?: boolean },
  ): Promise<void> {
    if (!orders?.length) return;
    const session = opts?.session;
    const deferEmit =
      opts?.deferEmit ?? Boolean(session && (session as any).inTransaction?.());
    try {
      const ids = orders.map((o) => o._id);
      const existing = await this.orderModel
        .find({ _id: { $in: ids } }, null, withSession({}, session))
        .lean();
      const map = new Map(existing.map((o: any) => [String(o._id), o]));
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
        for (const o of orders) {
          this.websocketGateway.emitOrderUpdated(user, o);
        }
      }
    } catch (err) {
      console.error('Error updating orders:', err);
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
    const twelveMonthsAgo = moment()
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
    const filterQuery: Record<string, any> = {};
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
        ...(filterQuery.tableDate ?? {}),
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
          const existingOrder: any = tablePaidOrders?.find(
            (paidOrder: any) => paidOrder.order === orderCollectionItem.order,
          );
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
        this.websocketGateway.emitCollectionChanged(user, collection);
      } catch (error) {
        console.error('Error emitting collection changed:', error);
      }
      try {
        await this.activityService.addActivity(
          user,
          ActivityType.TAKE_PAYMENT,
          collection,
        );
      } catch (error) {
        console.error('Error adding take payment activity:', error);
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
        this.websocketGateway.emitCollectionChanged(user, toEmit);
        for (const o of newOrders || []) {
          this.websocketGateway.emitOrderUpdated(user, o);
        }
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

    this.websocketGateway.emitCollectionChanged(user, collection);
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
      console.error('Failed to retrieve discounts from Redis:', error);
    }

    try {
      const discounts = await this.discountModel.find().exec();
      if (discounts.length > 0) {
        await this.redisService.set(RedisKeys.Discounts, discounts);
      }
      return discounts;
    } catch (error) {
      console.error('Failed to retrieve discounts from database:', error);
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
      });
      try {
        await newOrder.save();
        this.websocketGateway.emitOrderCreated(user, newOrder);
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
        this.websocketGateway.emitOrderUpdated(user, newOrder);
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
          this.websocketGateway.emitOrderUpdated(user, oldOrder); //Todo order delete message should be send
        } else {
          await oldOrder?.save();
          this.websocketGateway.emitOrderUpdated(user, oldOrder);
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
        console.error('Failed to add activity:', error);
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
          );
          await this.activityService.addActivity(
            user,
            ActivityType.ORDER_DISCOUNT,
            updatedOrder,
          );
          this.websocketGateway.emitOrderUpdated(user, updatedOrder);
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
          this.websocketGateway.emitOrderCreated(user, newOrder);
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
          this.websocketGateway.emitOrderUpdated(user, newOrder);
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
            this.websocketGateway.emitOrderUpdated(user, oldOrder); //todo :order delete message should be send
          } else {
            oldOrder.quantity = newQuantity;
            await oldOrder.save();
            this.websocketGateway.emitOrderUpdated(user, oldOrder);
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
      const updatedOrder = { ...order.toObject() };
      delete updatedOrder.discount;
      delete updatedOrder.discountPercentage;
      delete updatedOrder.discountAmount;
      delete updatedOrder.discountNote;

      try {
        await this.orderModel.findByIdAndUpdate(orderId, {
          $set: updatedOrder,
          $unset: {
            discount: '',
            discountPercentage: '',
            discountAmount: '',
            discountNote: '',
          },
        });
        this.websocketGateway.emitOrderUpdated(user, updatedOrder);
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
      });
      try {
        await newOrder.save();
        this.websocketGateway.emitOrderCreated(user, newOrder);
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
        this.websocketGateway.emitOrderUpdated(user, newOrder);
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
          this.websocketGateway.emitOrderUpdated(user, order); //todo:order delete message should be send
        } else {
          order.quantity = newQuantity;
          await order.save();
          this.websocketGateway.emitOrderUpdated(user, order);
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
          this.websocketGateway.emitOrderUpdated(user, oldOrder);
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
          this.websocketGateway.emitOrderUpdated(user, oldOrder);
          this.websocketGateway.emitOrderCreated(user, newOrder);
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
          this.websocketGateway.emitOrderUpdated(user, oldOrder);
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
      await this.tableService.removeTable(user, oldTableId);
      for (const order of orders) {
        this.websocketGateway.emitOrderUpdated(user, order);
      }
    } catch (error) {
      console.log(error);
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
      await this.tableService.removeTable(user, oldTableId);
      for (const order of orders) {
        this.websocketGateway.emitOrderUpdated(user, order);
      }
    } catch (error) {
      console.log(error);
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
        order.tableDate = order.table
          ? new Date((order.table as any).date)
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
        collection.tableDate = collection.table
          ? new Date((collection.table as any).date)
          : collection.createdAt; // Use createdAt as Date object

        await collection.save();
      }
    } catch (error) {
      console.error('Failed to update table dates:', error);
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
      console.error('Error updating orders with ikasId:', error);
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
      await this.websocketGateway.emitOrderUpdated(null, null);
      await this.websocketGateway.emitCollectionChanged(null, null);
      return {
        matchedOrders: result.matchedCount,
        modifiedOrders: result.modifiedCount,
        matchedCollections: collectionResult.matchedCount,
        modifiedCollections: collectionResult.modifiedCount,
      };
    } catch (error) {
      console.error('Error migrating orders to online:', error);
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
      await this.websocketGateway.emitOrderUpdated(null, null);
      return {
        matchedOrders: result.matchedCount,
        modifiedOrders: result.modifiedCount,
      };
    } catch (error) {
      console.error('Error migrating orders to online:', error);
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
      console.error('Error getting daily summary:', error);
      throw error;
    }
  }
  findOrderNotes() {
    return this.orderNotesModel.find().exec();
  }
  findByIkasId(ikasId: string) {
    return this.orderModel.findOne({ ikasId: ikasId }).exec();
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
    await this.websocketGateway.emitOrderNotesChanged();
    return orderNote;
  }
  async removeOrderNote(id: number) {
    const orderNote = await this.orderNotesModel.findByIdAndRemove(id);
    if (!orderNote) {
      throw new HttpException('Order note not found', HttpStatus.NOT_FOUND);
    }
    await this.websocketGateway.emitOrderNotesChanged();
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
      console.error('Error removing zero quantity orders:', error);
      throw new HttpException(
        'Failed to remove zero quantity orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async dedupeIkasDuplicates(options?: { sinceOnly?: Date; dryRun?: boolean }) {
    const sinceOnly = options?.sinceOnly;
    const dryRun = !!options?.dryRun;

    const matchStage: any = { ikasId: { $exists: true, $ne: null } };
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
              referencedOrderIds.has(o._id as unknown as number),
            );
            survivorOrderId = earliestReferenced?._id as unknown as number;
          } else {
            survivorOrderId = orders[0]?._id as unknown as number;
          }
          if (survivorOrderId == null) continue;

          const survivorCollections = collections.filter((c) =>
            (c.orders ?? []).some((oi) => oi.order === survivorOrderId),
          );

          let keptCollection: any = null;

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
                  } as any);
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
            (c) => !keptCollection || c._id !== (keptCollection as any)._id,
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
              ? (keptCollection._id as unknown as number)
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
}
