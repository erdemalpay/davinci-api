import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { endOfDay, format, parseISO, startOfDay } from 'date-fns';
import { Model, UpdateQuery } from 'mongoose';
import { StockHistoryStatusEnum } from '../accounting/accounting.dto';
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
  OrderQueryDto,
  OrderStatus,
  OrderType,
} from './order.dto';
import { OrderGateway } from './order.gateway';
import { Order } from './order.schema';

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Collection.name) private collectionModel: Model<Collection>,
    @InjectModel(Discount.name) private discountModel: Model<Discount>,
    private readonly tableService: TableService,
    private readonly orderGateway: OrderGateway,
    private readonly activityService: ActivityService,
    private readonly accountingService: AccountingService,
  ) {}
  // Orders
  async findAllOrders() {
    try {
      const orders = await this.orderModel
        .find()
        .populate('table', 'date _id name')
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
        .populate('table', 'date _id name')
        .exec();
      return orders;
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

  async findTodayOrders() {
    const start = startOfDay(new Date());
    const end = endOfDay(new Date());

    try {
      const orders = await this.orderModel
        .find({
          createdAt: { $gte: start, $lte: end },
        })
        .populate('table', 'date _id name')
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
        .populate('table', 'date _id name')
        .exec();

      return tableOrders;
    } catch (error) {
      throw new HttpException(
        "Failed to fetch given day's orders",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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
      if (
        order.discountAmount >= order.unitPrice ||
        order.discountPercentage >= 100
      ) {
        const orderWithItem = await order.populate('item');
        for (const ingredient of (orderWithItem.item as any).itemProduction) {
          const isStockDecrementRequired = ingredient?.isDecrementStock;

          if (isStockDecrementRequired) {
            const consumptionQuantity =
              ingredient.quantity * orderWithItem.paidQuantity;
            await this.accountingService.consumptStock(user, {
              product: ingredient.product,
              location:
                order?.stockLocation ??
                (order?.location === 1 ? 'bahceli' : 'neorama'),
              quantity: consumptionQuantity,
              packageType: 'birim',
              status: StockHistoryStatusEnum.ORDERCREATE,
            });
          }
        }
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
      this.orderGateway.emitOrderCreated(user, order);
    } catch (error) {
      throw new HttpException(
        'Failed to create order',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

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

    return order;
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
          const oldOrder = await (
            await this.orderModel.findById(order._id)
          ).populate('item');
          if (!oldOrder) {
            throw new HttpException(
              `Order with ID ${order._id} not found`,
              HttpStatus.NOT_FOUND,
            );
          }

          for (const ingredient of (oldOrder?.item as any).itemProduction) {
            const isStockDecrementRequired = ingredient?.isDecrementStock;
            const quantityDifference =
              order.paidQuantity - oldOrder?.paidQuantity;
            if (isStockDecrementRequired && quantityDifference > 0) {
              const consumptionQuantity =
                ingredient.quantity * quantityDifference;
              await this.accountingService.consumptStock(user, {
                product: ingredient.product,
                location:
                  oldOrder?.stockLocation ??
                  (oldOrder?.location === 1 ? 'bahceli' : 'neorama'),
                quantity: consumptionQuantity,
                packageType: 'birim',
                status: StockHistoryStatusEnum.ORDERCREATE,
              });
            }
            if (isStockDecrementRequired && quantityDifference < 0) {
              const incrementQuantity =
                ingredient.quantity * -quantityDifference;
              await this.accountingService.createStock(user, {
                product: ingredient.product,
                location: oldOrder?.stockLocation,
                quantity: incrementQuantity,
                packageType: 'birim',
                status: StockHistoryStatusEnum.ORDERCANCEL,
              });
            }
          }

          const updatedOrder = {
            ...order,
            _id: oldOrder?._id,
            item: (oldOrder?.item as any)._id,
          };
          await this.orderModel.findByIdAndUpdate(order._id, updatedOrder);
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

  // Collections
  async findAllCollections() {
    try {
      const collections = await this.collectionModel
        .find()
        .populate('table', 'date _id name')
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
        .populate('table', 'date _id name')
        .exec();
      return collections;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findGivenTableCollection(tableId: number) {
    try {
      const tableCollection = await this.collectionModel
        .find({ table: tableId })
        .populate('table', 'date _id name')
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
      const discounts = await this.discountModel.find();
      return discounts;
    } catch (error) {
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
    console.log(discountNote);
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
            const orderWithItem = await oldOrder?.populate('item');

            for (const ingredient of (orderWithItem.item as any)
              .itemProduction) {
              const isStockDecrementRequired = ingredient?.isDecrementStock;
              if (isStockDecrementRequired) {
                const consumptionQuantity =
                  ingredient.quantity * oldOrder?.quantity;

                await this.accountingService.consumptStock(user, {
                  product: ingredient.product,
                  location:
                    oldOrder?.stockLocation ??
                    (oldOrder?.location === 1 ? 'bahceli' : 'neorama'),
                  quantity: consumptionQuantity,
                  packageType: 'birim',
                  status: StockHistoryStatusEnum.ORDERCREATE,
                });
              }
            }
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
            const orderWithItem = await newOrder.populate('item');
            for (const ingredient of (orderWithItem.item as any)
              .itemProduction) {
              const isStockDecrementRequired = ingredient?.isDecrementStock;
              if (isStockDecrementRequired) {
                const consumptionQuantity =
                  ingredient.quantity * oldOrder?.paidQuantity;
                await this.accountingService.consumptStock(user, {
                  product: ingredient.product,
                  location:
                    oldOrder?.stockLocation ??
                    (oldOrder?.location === 1 ? 'bahceli' : 'neorama'),
                  quantity: consumptionQuantity,
                  packageType: 'birim',
                  status: StockHistoryStatusEnum.ORDERCREATE,
                });
              }
            }
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
  async singleOrderTransfer(
    user: User,
    order: Order,
    transferredTableId: number,
  ) {
    const oldTable = await this.tableService.getTableById(order.table);
    if (!oldTable) {
      throw new HttpException('Table not found', HttpStatus.BAD_REQUEST);
    }
    const newTable = await this.tableService.getTableById(transferredTableId);
    if (!newTable) {
      throw new HttpException('Table not found', HttpStatus.BAD_REQUEST);
    }
    oldTable.orders = oldTable.orders.filter(
      (tableOrder) => tableOrder == order._id,
    );
    newTable.orders.push(order._id);
    order.table = transferredTableId;
    try {
      await Promise.all([oldTable.save(), newTable.save(), order.save()]);
      this.orderGateway.emitOrderUpdated(user, order);
    } catch (error) {
      throw new HttpException(
        'Failed to transfer order',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return order;
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
