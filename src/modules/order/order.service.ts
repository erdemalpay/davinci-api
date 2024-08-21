import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { endOfDay, format, parseISO, startOfDay } from 'date-fns';
import { Model, UpdateQuery } from 'mongoose';
import { TableService } from '../table/table.service';
import { User } from '../user/user.schema';
import { Collection } from './collection.schema';
import { Discount } from './discount.schema';
import {
  CreateCollectionDto,
  CreateDiscountDto,
  CreateOrderDto,
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
  ) {}
  // Orders
  async findAllOrders() {
    try {
      const orders = await this.orderModel
        .find()
        .populate('location table item discount')
        .populate({
          path: 'createdBy preparedBy deliveredBy cancelledBy',
          select: '-password',
        })
        .exec();
      return orders;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async findTodayOrders() {
    const start = startOfDay(new Date());
    const end = endOfDay(new Date());

    try {
      const orders = await this.orderModel
        .find({
          createdAt: { $gte: start, $lte: end },
        })
        .populate('location table item discount')
        .populate({
          path: 'createdBy preparedBy deliveredBy cancelledBy',
          select: '-password',
        })
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
      }
      if (discount?.amount) {
        const discountPerUnit = discount.amount / order.quantity;
        order.discountAmount = Math.min(discountPerUnit, order.unitPrice);
      }
    }

    try {
      await order.save();
      const populatedOrder = await this.orderModel
        .findById(order._id)
        .populate('location table item discount')
        .populate({
          path: 'createdBy preparedBy deliveredBy cancelledBy',
          select: '-password',
        })
        .exec();
      this.orderGateway.emitOrderCreated(populatedOrder);
    } catch (error) {
      throw new HttpException(
        'Failed to create order',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    let updatedTable;
    try {
      updatedTable = await this.tableService.updateTableOrders(
        createOrderDto.table,
        order._id,
      );
    } catch (error) {
      // Clean up by deleting the order if updating the table fails
      await this.orderModel.findByIdAndDelete(order._id);
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
  updateOrder(id: number, updates: UpdateQuery<Order>) {
    if (updates?.division === 1) {
      return this.orderModel
        .findByIdAndUpdate(
          id,
          {
            $unset: { division: '' },
          },
          {
            new: true,
          },
        )
        .then((order) => {
          this.orderGateway.emitOrderUpdated(order);
          return order;
        });
    } else {
      return this.orderModel
        .findByIdAndUpdate(id, updates, {
          new: true,
        })
        .then((order) => {
          this.orderGateway.emitOrderUpdated(order);
          return order;
        });
    }
  }

  async updateMultipleOrders(ids: number[], updates: UpdateQuery<Order>) {
    try {
      await Promise.all(
        ids.map(async (id) => {
          await this.orderModel.findByIdAndUpdate(id, updates, {
            new: true,
          });
        }),
      );
      this.orderGateway.emitOrderUpdated(ids);
    } catch (error) {
      console.error('Error updating orders:', error);
      throw new HttpException(
        'Failed to update some orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async updateOrders(orders: OrderType[]) {
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
          const updatedOrder = { ...order, _id: oldOrder._id };
          await this.orderModel.findByIdAndUpdate(order._id, updatedOrder);
        }),
      );
      orders && this.orderGateway.emitOrderUpdated(orders[0]);
    } catch (error) {
      console.error('Error updating orders:', error);
      throw new HttpException(
        'Failed to update some orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  removeOrder(id: number) {
    return this.orderModel.findByIdAndRemove(id);
  }
  async removeMultipleOrders(ids: number[]): Promise<void> {
    try {
      await Promise.all(
        ids.map(async (id) => {
          await this.orderModel.findByIdAndRemove(id);
        }),
      );
    } catch (error) {
      console.error('Error removing orders:', error);
      throw new HttpException(
        'Failed to remove some orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  // Collections
  async findAllCollections() {
    try {
      const collections = await this.collectionModel
        .find()
        .populate('location paymentMethod table')
        .populate({
          path: 'createdBy cancelledBy',
          select: '-password',
        })
        .exec();
      return collections;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch collections',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async findGivenDateCollections(date: string, location: number) {
    try {
      const parsedDate = parseISO(date);
      const tables = await this.tableService.findByDateAndLocation(
        format(parsedDate, 'yyyy-MM-dd'),
        location,
      );

      const allCollections = await this.collectionModel
        .find({})
        .populate('location paymentMethod table')
        .populate({
          path: 'createdBy cancelledBy',
          select: '-password',
        })
        .exec();

      const collections = allCollections.filter((collection) =>
        tables.some((table) => table._id === (collection.table as any)._id),
      );

      return collections;
    } catch (error) {
      throw new HttpException(
        "Failed to fetch given day's collections",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async createCollection(user: User, createCollectionDto: CreateCollectionDto) {
    const collection = new this.collectionModel({
      ...createCollectionDto,
      createdBy: user._id,
      createdAt: new Date(),
    });

    try {
      await collection.save();
    } catch (error) {
      throw new HttpException(
        'Failed to create collection',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return collection;
  }
  updateCollection(id: number, updates: UpdateQuery<Collection>) {
    return this.collectionModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeCollection(id: number) {
    return this.collectionModel.findByIdAndRemove(id);
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
  async createDiscount(createDiscountDto: CreateDiscountDto) {
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
    return discount;
  }
  updateDiscount(id: number, updates: UpdateQuery<Discount>) {
    return this.discountModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async removeDiscount(id: number) {
    const orders = await this.orderModel.find({ discount: id });
    if (orders.length > 0) {
      throw new HttpException(
        'Discount is used in orders',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.discountModel.findByIdAndRemove(id);
  }
  async createOrderForDivide(
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
      const { _id, ...orderDataWithoutId } = oldOrder.toObject();
      // Create new order without the _id field
      const newOrder = new this.orderModel({
        ...orderDataWithoutId,
        quantity: orderItem.selectedQuantity,
        paidQuantity: 0,
      });
      try {
        await newOrder.save();
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
          newOrder.table,
          newOrder._id,
        );
      } catch (error) {
        // Clean up by deleting the order if updating the table fails
        await this.orderModel.findByIdAndDelete(newOrder._id);
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
        if (oldOrder.quantity === 0) {
          await this.orderModel.findByIdAndDelete(oldOrder._id);
        } else {
          await oldOrder.save();
          this.orderGateway.emitOrderUpdated(oldOrder);
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
    orders: {
      totalQuantity: number;
      selectedQuantity: number;
      orderId: number;
    }[],
    discount: number,
    discountPercentage?: number,
    discountAmount?: number,
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
          await this.orderModel.findByIdAndUpdate(orderItem.orderId, {
            discount: discount,
            ...(discountPercentage && {
              discountPercentage: discountPercentage,
            }),
            ...(discountAmount && {
              discountAmount: Math.min(
                discountAmount / totalSelectedQuantity,
                oldOrder.unitPrice,
              ),
            }),
          });
        } catch (error) {
          throw new HttpException(
            'Failed to update order',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      } else {
        // Destructure oldOrder to exclude the _id field
        const { _id, ...orderDataWithoutId } = oldOrder.toObject();
        // Create new order without the _id field
        const newOrder = new this.orderModel({
          ...orderDataWithoutId,
          quantity: orderItem.selectedQuantity,
          discount: discount,
          ...(discountPercentage && {
            discountPercentage: discountPercentage,
          }),
          ...(discountAmount && {
            discountAmount: Math.min(
              discountAmount / totalSelectedQuantity,
              oldOrder.unitPrice,
            ),
          }),
          paidQuantity: 0,
        });
        try {
          await newOrder.save();
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
            newOrder.table,
            newOrder._id,
          );
        } catch (error) {
          // Clean up by deleting the order if updating the table fails
          await this.orderModel.findByIdAndDelete(newOrder._id);
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
          if (oldOrder.quantity === 0) {
            await this.orderModel.findByIdAndDelete(oldOrder._id);
          } else {
            await oldOrder.save();
            this.orderGateway.emitOrderUpdated(oldOrder);
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
  async cancelDiscountForOrder(orderId: number, cancelQuantity: number) {
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
          newOrder.table,
          newOrder._id,
        );
      } catch (error) {
        // Clean up by deleting the order if updating the table fails
        await this.orderModel.findByIdAndDelete(newOrder._id);
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
        } else {
          await order.save();
          this.orderGateway.emitOrderUpdated(order);
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
}
