import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { format, parseISO } from 'date-fns';
import * as moment from 'moment';
import { Model, PipelineStage, UpdateQuery } from 'mongoose';
import { StockHistoryStatusEnum } from '../accounting/accounting.dto';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { TableGateway } from '../table/table.gateway';
import { Table } from '../table/table.schema';
import { TableService } from '../table/table.service';
import { User } from '../user/user.schema';
import { AccountingService } from './../accounting/accounting.service';
import { ActivityType } from './../activity/activity.dto';
import { ActivityService } from './../activity/activity.service';
import { Collection } from './collection.schema';
import { Discount } from './discount.schema';
import {
  CollectionQueryDto,
  CreateCollectionDto,
  CreateDiscountDto,
  CreateOrderDto,
  OrderCollectionStatus,
  OrderQueryDto,
  OrderStatus,
  OrderType,
  SummaryCollectionQueryDto,
} from './order.dto';
import { OrderGateway } from './order.gateway';
import { Order } from './order.schema';

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Collection.name) private collectionModel: Model<Collection>,
    @InjectModel(Discount.name) private discountModel: Model<Discount>,
    @Inject(forwardRef(() => TableService))
    private readonly tableService: TableService,
    private readonly orderGateway: OrderGateway,
    private readonly tableGateway: TableGateway,
    private readonly activityService: ActivityService,
    private readonly accountingService: AccountingService,
    private readonly redisService: RedisService,
  ) {}
  // Orders
  async findAllOrders() {
    try {
      const orders = await this.orderModel
        .find()
        .populate('table', 'date _id name isOnlineSale finishHour type')
        .exec();
      return orders;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async findQueryOrders(query: OrderQueryDto) {
    const filterQuery = {};
    const { after } = query;
    if (after) {
      filterQuery['createdAt'] = { $gte: new Date(after) };
    }
    try {
      const orders = await this.orderModel
        .find(filterQuery)
        .populate('table', 'date _id name isOnlineSale finishHour type')
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

  async findPersonalDatas(query: OrderQueryDto) {
    const filterQuery: any = {};
    const { after, before } = query;
    if (after) {
      filterQuery['createdAt'] = { $gte: new Date(after) };
    }
    if (before) {
      filterQuery['createdAt'] = {
        ...filterQuery['createdAt'],
        $lte: new Date(before),
      };
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
          createdAt: { $gte: start, $lte: end }, // Only orders on 'after' date
        })
        .populate('table', 'date _id name isOnlineSale finishHour type')
        .exec();
      return orders;
    } catch (error) {
      throw new HttpException(
        "Failed to fetch today's orders",
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
        .populate('table', 'date _id name isOnlineSale finishHour type')
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
    const createdOrders: number[] = [];
    const soundRoles = new Set<number>();
    for (const order of orders) {
      const createdOrder = new this.orderModel({
        ...order,
        status: order?.status ?? 'pending',
        createdBy: user._id,
        createdAt: new Date(),
        table: table._id,
      });
      if (createdOrder?.discount) {
        const discount = await this.discountModel.findById(
          createdOrder.discount,
        );
        if (!discount) {
          throw new HttpException('Discount not found', HttpStatus.NOT_FOUND);
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
        const orderWithItem = await createdOrder.populate('item kitchen');
        if (
          (orderWithItem?.kitchen as any)?.soundRoles &&
          createdOrder.status !== OrderStatus.AUTOSERVED &&
          createdOrder.status !== OrderStatus.SERVED
        ) {
          (orderWithItem?.kitchen as any)?.soundRoles.forEach(
            (role: number) => {
              soundRoles.add(role);
            },
          );
        }
        for (const ingredient of (orderWithItem.item as any).itemProduction) {
          const isStockDecrementRequired = ingredient?.isDecrementStock;
          if (isStockDecrementRequired) {
            const consumptionQuantity =
              ingredient.quantity * orderWithItem.quantity;
            await this.accountingService.consumptStock(user, {
              product: ingredient.product,
              location: createdOrder?.stockLocation ?? createdOrder?.location,
              quantity: consumptionQuantity,
              status:
                createdOrder?.stockNote ?? StockHistoryStatusEnum.ORDERCREATE,
            });
          }
        }
        if (
          (createdOrder.discountAmount >= createdOrder.unitPrice ||
            createdOrder.discountPercentage >= 100) &&
          createdOrder?.table
        ) {
          await this.createCollection(user, {
            location: createdOrder.location,
            amount: 0,
            status: 'paid',
            paymentMethod: 'cash',
            table: table._id,
            orders: [
              {
                order: createdOrder._id,
                paidQuantity: createdOrder.quantity,
              },
            ],
          });
        }
        this.activityService.addActivity(
          user,
          ActivityType.CREATE_ORDER,
          createdOrder,
        );
      } catch (error) {
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
    // to change the orders page in the frontend
    this.orderGateway.emitCreateMultipleOrder(
      user,
      table,
      Array.from(soundRoles),
    );
    return createdOrders;
  }

  async createOrder(user: User, createOrderDto: CreateOrderDto) {
    const order = new this.orderModel({
      ...createOrderDto,
      status: createOrderDto?.status ?? 'pending',
      createdBy: user._id,
      createdAt: new Date(),
    });
    if (createOrderDto?.discount) {
      const discount = await this.discountModel.findById(
        createOrderDto.discount,
      );

      if (!discount) {
        throw new HttpException('Discount not found', HttpStatus.NOT_FOUND);
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
      const orderWithItem = await order.populate('item kitchen');
      for (const ingredient of (orderWithItem.item as any).itemProduction) {
        const isStockDecrementRequired = ingredient?.isDecrementStock;
        if (isStockDecrementRequired) {
          const consumptionQuantity =
            ingredient.quantity * orderWithItem.quantity;
          await this.accountingService.consumptStock(user, {
            product: ingredient.product,
            location: order?.stockLocation ?? order?.location,
            quantity: consumptionQuantity,
            status:
              createOrderDto?.stockNote ?? StockHistoryStatusEnum.ORDERCREATE,
          });
        }
      }
      if (
        (order.discountAmount >= order.unitPrice ||
          order.discountPercentage >= 100) &&
        order?.table
      ) {
        await this.createCollection(user, {
          location: order.location,
          amount: 0,
          status: 'paid',
          paymentMethod: 'cash',
          table: order.table,
          orders: [
            {
              order: order._id,
              paidQuantity: order.quantity,
            },
          ],
        });
      }
      this.activityService.addActivity(user, ActivityType.CREATE_ORDER, order);
      if (order?.table) {
        this.orderGateway.emitOrderCreated(user, order);
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
        this.orderGateway.emitOrderUpdated(user, order);
        throw new HttpException(
          'Failed to update table orders',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      if (!updatedTable) {
        throw new HttpException('Table not found', HttpStatus.BAD_REQUEST);
      }
    }
    return order;
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
        createdBy: user._id,
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
        createdBy: user._id,
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
            ingredient.quantity * populatedReturnOrder?.quantity;
          await this.accountingService.createStock(user, {
            product: ingredient.product,
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
      this.orderGateway.emitOrderCreated(user, returnOrder);
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
    // adding activities
    if (updates?.status) {
      const order = await this.orderModel.findById(id);
      if (updates?.status === OrderStatus.READYTOSERVE && !updates?.quantity) {
        await this.activityService.addActivity(
          user,
          ActivityType.PREPARE_ORDER,
          order,
        );
      }
      if (updates?.status === OrderStatus.SERVED && !updates?.quantity) {
        await this.activityService.addActivity(
          user,
          ActivityType.DELIVER_ORDER,
          order,
        );
      }
      if (updates?.status === OrderStatus.CANCELLED && !updates?.quantity) {
        await this.activityService.addActivity(
          user,
          ActivityType.CANCEL_ORDER,
          order,
        );
      }
      if (updates?.status === OrderStatus.CANCELLED) {
        const oldOrder = await this.orderModel.findById(id).populate('item');

        for (const ingredient of (oldOrder?.item as any).itemProduction) {
          const isStockDecrementRequired = ingredient?.isDecrementStock;
          if (isStockDecrementRequired) {
            const incrementQuantity = ingredient.quantity * oldOrder?.quantity;
            await this.accountingService.createStock(user, {
              product: ingredient.product,
              location: oldOrder?.stockLocation,
              quantity: incrementQuantity,
              status: StockHistoryStatusEnum.ORDERCANCEL,
            });
          }
        }
        await this.activityService.addActivity(
          user,
          ActivityType.CANCEL_ORDER,
          order,
        );
      }
      if (updates?.quantity && updates?.quantity > order.quantity) {
        await this.activityService.addActivity(
          user,
          ActivityType.ADD_ORDER,
          order,
        );
      }
    }
    if (updates?.division === 1) {
      return this.orderModel
        .findByIdAndUpdate(id, { $unset: { division: '' } }, { new: true })
        .then((order) => {
          this.orderGateway.emitOrderUpdated(user, order);
          return order;
        });
    } else {
      return this.orderModel
        .findByIdAndUpdate(id, updates, {
          new: true,
        })
        .then((order) => {
          this.orderGateway.emitOrderUpdated(user, order);
          return order;
        });
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
      const order = await this.orderModel.findOne({ _id: ids[0] });
      this.orderGateway.emitOrderUpdated(user, order);
    } catch (error) {
      console.error('Error updating orders:', error);
      throw new HttpException(
        'Failed to update some orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async updateOrders(user: User, orders: OrderType[]) {
    if (!orders?.length || orders?.length === 0) {
      return;
    }
    try {
      await Promise.all(
        orders?.map(async (order) => {
          const oldOrder = await this.orderModel.findById(order._id);
          if (!oldOrder) {
            throw new HttpException(
              `Order with ID ${order._id} not found`,
              HttpStatus.NOT_FOUND,
            );
          }
          const updatedOrder = {
            ...order,
            _id: oldOrder?._id,
            item: oldOrder.item,
          };
          await this.orderModel.findByIdAndUpdate(order._id, updatedOrder, {
            new: true,
          });
        }),
      );
      orders && this.orderGateway.emitOrderUpdated(user, orders[0]);
    } catch (error) {
      console.error('Error updating orders:', error);
      throw new HttpException(
        'Failed to update some orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async categoryBasedOrderSummary(
    user: User,
    category: number,
    location?: number,
  ) {
    const twelveMonthsAgo = moment()
      .subtract(12, 'months')
      .startOf('month')
      .toDate();

    let pipeline: PipelineStage[] = [
      {
        $match: {
          createdAt: { $gte: twelveMonthsAgo },
          status: { $ne: 'CANCELLED' },
          ...(location !== undefined &&
            location && { location: Number(location) }),
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
          _id: { month: { $month: '$createdAt' } },
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
        $sort: { '_id.month': 1 },
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
          total: 1,
        },
      },
    ];

    const results = await this.orderModel.aggregate(pipeline).exec();
    return results;
  }

  // Collections
  async findAllCollections() {
    try {
      const collections = await this.collectionModel
        .find()
        .populate('table', 'date _id name isOnlineSale finishHour type')
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
    const filterQuery = {};
    const { after } = query;
    if (after) {
      filterQuery['createdAt'] = { $gte: new Date(after) };
    }
    try {
      const collections = await this.collectionModel
        .find(filterQuery)
        .populate('table', 'date _id name isOnlineSale finishHour type')
        .exec();
      return collections;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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
        .populate('table', 'date _id name isOnlineSale finishHour type')
        .exec();

      return tableCollection;
    } catch (error) {
      throw new HttpException(
        "Failed to fetch given day's collections",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async createCollection(user: User, createCollectionDto: CreateCollectionDto) {
    const { newOrders, ...filteredCollectionDto } = createCollectionDto;
    const collection = new this.collectionModel({
      ...filteredCollectionDto, // Use the filtered object
      createdBy: user._id,
      createdAt: new Date(),
    });

    if (newOrders) {
      await this.updateOrders(user, newOrders);
    }

    try {
      await collection.save();
      this.orderGateway.emitCollectionChanged(user, collection);
      this.activityService.addActivity(
        user,
        ActivityType.TAKE_PAYMENT,
        collection,
      );
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
    const { newOrders, ...filteredUpdates } = updates;
    if (newOrders) {
      await this.updateOrders(user, newOrders);
    }
    const collection = await this.collectionModel.findByIdAndUpdate(
      id,
      updates,
      {
        new: true,
      },
    );
    this.orderGateway.emitCollectionChanged(user, collection);
    return collection;
  }
  async removeCollection(user: User, id: number) {
    const collection = await this.collectionModel.findByIdAndRemove(id);

    this.orderGateway.emitCollectionChanged(user, collection);
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
    this.orderGateway.emitDiscountChanged(user, discount);
    return discount;
  }
  async updateDiscount(user: User, id: number, updates: UpdateQuery<Discount>) {
    const discount = await this.discountModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.orderGateway.emitDiscountChanged(user, discount);
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
    this.orderGateway.emitDiscountChanged(user, discount);
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
      const newOrder = new this.orderModel({
        ...orderDataWithoutId,
        quantity: orderItem.selectedQuantity,
        paidQuantity: 0,
      });
      try {
        await newOrder.save();
        this.orderGateway.emitOrderCreated(user, newOrder);
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
        this.orderGateway.emitOrderUpdated(user, newOrder);
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
          this.orderGateway.emitOrderUpdated(user, oldOrder);
        } else {
          await oldOrder?.save();
          this.orderGateway.emitOrderUpdated(user, oldOrder);
        }
      } catch (error) {
        throw new HttpException(
          'Failed to update order',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
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
          this.orderGateway.emitOrderUpdated(user, updatedOrder);
          if (
            (discountPercentage && discountPercentage >= 100) ||
            (discountAmount && discountAmount >= oldOrder?.unitPrice)
          ) {
            await this.createCollection(user, {
              location: oldOrder?.location,
              amount: 0,
              status: 'paid',
              paymentMethod: 'cash',
              table: oldOrder?.table,
              orders: [
                {
                  order: oldOrder?._id,
                  paidQuantity: orderItem.selectedQuantity,
                },
              ],
            });
          }
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
          this.orderGateway.emitOrderCreated(user, newOrder);
          if (
            (discountPercentage && discountPercentage >= 100) ||
            (discountAmount && discountAmount >= oldOrder?.unitPrice)
          ) {
            await this.createCollection(user, {
              location: newOrder.location,
              amount: 0,
              status: 'paid',
              paymentMethod: 'cash',
              table: newOrder.table,
              orders: [
                {
                  order: newOrder._id,
                  paidQuantity: newOrder.quantity,
                },
              ],
            });
          }
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
          this.orderGateway.emitOrderUpdated(user, newOrder);
          throw new HttpException(
            'Failed to update table orders',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        if (!updatedTable) {
          throw new HttpException('Table not found', HttpStatus.BAD_REQUEST);
        }
        // Update the old order
        oldOrder.quantity =
          orderItem.totalQuantity - orderItem.selectedQuantity;

        try {
          if (oldOrder?.quantity === 0) {
            await this.orderModel.findByIdAndDelete(oldOrder?._id);
            this.orderGateway.emitOrderUpdated(user, oldOrder);
          } else {
            await oldOrder?.save();
            this.orderGateway.emitOrderUpdated(user, oldOrder);
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
    if (!order) {
      throw new HttpException('Order not found', HttpStatus.BAD_REQUEST);
    }
    if (order.quantity === cancelQuantity) {
      const updatedOrder = { ...order.toObject() };
      delete updatedOrder.discount;
      delete updatedOrder.discountPercentage;

      try {
        await this.orderModel.findByIdAndUpdate(orderId, {
          $set: updatedOrder,
          $unset: { discount: '', discountPercentage: '' },
        });
        this.orderGateway.emitOrderUpdated(user, updatedOrder);
      } catch (error) {
        throw new HttpException(
          'Failed to update order',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    } else {
      const { _id, ...orderDataWithoutId } = order.toObject();
      const newOrder = new this.orderModel({
        ...orderDataWithoutId,
        quantity: cancelQuantity,
        paidQuantity: 0,
      });
      try {
        await newOrder.save();
        this.orderGateway.emitOrderCreated(user, newOrder);
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
        this.orderGateway.emitOrderUpdated(user, newOrder);
        throw new HttpException(
          'Failed to update table orders',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      if (!updatedTable) {
        throw new HttpException('Table not found', HttpStatus.BAD_REQUEST);
      }
      // Update the old order
      order.quantity = order.quantity - cancelQuantity;

      try {
        if (order.quantity === 0) {
          await this.orderModel.findByIdAndDelete(order._id);
          this.orderGateway.emitOrderUpdated(user, order);
        } else {
          await order.save();
          this.orderGateway.emitOrderUpdated(user, order);
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
      const oldOrder = await this.orderModel.findById(orderItem.orderId);
      const oldTable = await this.tableService.getTableById(oldOrder.table);
      if (!oldOrder) {
        throw new HttpException('Order not found', HttpStatus.BAD_REQUEST);
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
          this.orderGateway.emitOrderUpdated(user, oldOrder);
          this.tableGateway.emitSingleTableChanged(user, oldTable);
        } catch (error) {
          throw new HttpException(
            'Failed to transfer order',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }
      // order partially transferred
      else {
        // Destructure oldOrder to exclude the _id field
        const { _id, ...orderDataWithoutId } = oldOrder?.toObject();
        // Create new order without the _id field
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
          this.orderGateway.emitOrderUpdated(user, oldOrder);
          this.tableGateway.emitSingleTableChanged(user, oldTable);
        } catch (error) {
          throw new HttpException(
            'Failed to transfer order',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }
    }
  }
  async tableTransfer(
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
      this.orderGateway.emitOrderUpdated(user, orders[0]);
    } catch (error) {
      console.log(error);
      throw new HttpException(
        'Failed to transfer orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return orders;
  }
}
