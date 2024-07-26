import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { endOfDay, parseISO, startOfDay } from 'date-fns';
import { Model, UpdateQuery } from 'mongoose';
import { TableService } from '../table/table.service';
import { User } from '../user/user.schema';
import { Collection } from './collection.schema';
import { Discount } from './discount.schema';
import {
  CreateCollectionDto,
  CreateDiscountDto,
  CreateOrderDto,
  CreatePaymentDto,
} from './order.dto';
import { Order } from './order.schema';
import { OrderPayment } from './orderPayment.schema';

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Collection.name) private collectionModel: Model<Collection>,
    @InjectModel(OrderPayment.name) private paymentModel: Model<OrderPayment>,
    @InjectModel(Discount.name) private discountModel: Model<Discount>,
    private readonly tableService: TableService,
  ) {}
  // Orders
  async findAllOrders() {
    try {
      const orders = await this.orderModel
        .find()
        .populate('location table item')
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
        .populate('location table item')
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
    const parsedDate = parseISO(date);
    try {
      const orders = await this.orderModel
        .find({
          createdAt: {
            $gte: startOfDay(parsedDate),
            $lte: endOfDay(parsedDate),
          },
          location: location,
        })
        .populate('location table item')
        .populate({
          path: 'createdBy preparedBy deliveredBy cancelledBy',
          select: '-password',
        })
        .exec();
      return orders;
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
      status: 'pending',
      createdBy: user._id,
      createdAt: new Date(),
    });

    try {
      await order.save();
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
    return this.orderModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  async updateMultipleOrders(user: User, ids: number[], status: string) {
    try {
      const result = await this.orderModel.updateMany(
        { _id: { $in: ids } },
        { status: status, preparedBy: user._id, preparedAt: new Date() },
        { new: true },
      );
      return result;
    } catch (error) {
      throw new HttpException(
        'Failed to update multiple orders',
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
        .populate('location paymentMethod orderPayment')
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
    const parsedDate = parseISO(date);
    try {
      const collections = await this.collectionModel
        .find({
          createdAt: {
            $gte: startOfDay(parsedDate),
            $lte: endOfDay(parsedDate),
          },
          location: location,
        })
        .populate('location paymentMethod orderPayment')
        .populate({
          path: 'createdBy',
          select: '-password',
        })
        .exec();
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
    // add the collection under orderpayment
    const orderPayment = await this.paymentModel.findOne({
      _id: createCollectionDto.orderPayment,
    });
    if (!orderPayment) {
      throw new HttpException(
        'Order Payment not found',
        HttpStatus.BAD_REQUEST,
      );
    }
    orderPayment.collections = [...orderPayment.collections, collection._id];
    await orderPayment.save();
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
  // Paymenys
  async findAllPayments() {
    try {
      const payments = await this.paymentModel
        .find()
        .populate('location table');

      return payments;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch payments',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findGivenDatePayments(date: string, location: number) {
    const parsedDate = parseISO(date);
    try {
      const payments = await this.paymentModel
        .find({
          createdAt: {
            $gte: startOfDay(parsedDate),
            $lte: endOfDay(parsedDate),
          },
          location: location,
        })
        .populate('location table')
        .exec();
      return payments;
    } catch (error) {
      throw new HttpException(
        "Failed to fetch given day's payments",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async createPayment(user: User, createPaymentDto: CreatePaymentDto) {
    const payment = new this.paymentModel({
      ...createPaymentDto,
    });
    try {
      await payment.save();
    } catch (error) {
      throw new HttpException(
        'Failed to create payment',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    // Update the table
    let updatedTable;
    try {
      updatedTable = await this.tableService.update(user, payment.table, {
        payment: payment._id,
      });
    } catch (error) {
      // Clean up by deleting the order if updating the table fails
      await this.paymentModel.findByIdAndDelete(payment._id);
      throw new HttpException(
        'Failed to update table payment',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    if (!updatedTable) {
      throw new HttpException('Table not found', HttpStatus.BAD_REQUEST);
    }

    return payment;
  }

  updatePayment(id: number, updates: UpdateQuery<OrderPayment>) {
    return this.paymentModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removePayment(id: number) {
    return this.paymentModel.findByIdAndRemove(id);
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
  removeDiscount(id: number) {
    return this.discountModel.findByIdAndRemove(id);
  }

  async createOrderForDiscount(
    orders: {
      totalQuantity: number;
      selectedQuantity: number;
      orderId: number;
    }[],
    orderPaymentId: number,
    discount: number,
    discountPercentage: number,
  ) {
    const orderPayment = await this.paymentModel.findById(orderPaymentId);
    if (!orderPayment) {
      throw new HttpException(
        'Order Payment not found',
        HttpStatus.BAD_REQUEST,
      );
    }
    for (const orderItem of orders) {
      const oldOrder = await this.orderModel.findById(orderItem.orderId);
      if (!oldOrder) {
        throw new HttpException('Order not found', HttpStatus.BAD_REQUEST);
      }
      if (orderItem.selectedQuantity === orderItem.totalQuantity) {
        orderPayment.orders = [
          ...orderPayment.orders.filter(
            (paymentItem) => paymentItem.order !== orderItem.orderId,
          ),
          {
            order: orderItem.orderId,
            discount: discount,
            discountPercentage: discountPercentage,
            totalQuantity: orderItem.totalQuantity,
            paidQuantity: 0,
          },
        ];
        orderPayment.discountAmount =
          orderPayment.discountAmount +
          (oldOrder.unitPrice *
            discountPercentage *
            orderItem.selectedQuantity) /
            100;
        await orderPayment.save();
      } else {
        // Destructure oldOrder to exclude the _id field
        const { _id, ...orderDataWithoutId } = oldOrder.toObject();
        // Create new order without the _id field
        const newOrder = new this.orderModel({
          ...orderDataWithoutId,
          quantity: orderItem.selectedQuantity,
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
          }
        } catch (error) {
          throw new HttpException(
            'Failed to update order',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        // Add the new order and update the old order in orderPayment
        orderPayment.orders = [
          ...orderPayment.orders.filter(
            (paymentItem) => paymentItem.order !== orderItem.orderId,
          ),
          {
            order: newOrder._id,
            discount: discount,
            discountPercentage: discountPercentage,
            totalQuantity: newOrder.quantity,
            paidQuantity: 0,
          },
          {
            order: orderItem.orderId,
            totalQuantity:
              orderPayment.orders.find(
                (paymentItem) => paymentItem.order === orderItem.orderId,
              )?.totalQuantity - newOrder.quantity || 0,
            paidQuantity:
              orderPayment.orders.find(
                (paymentItem) => paymentItem.order === orderItem.orderId,
              )?.paidQuantity || 0,
          },
        ];
        orderPayment.discountAmount =
          orderPayment.discountAmount +
          (newOrder.quantity * newOrder.unitPrice * discountPercentage) / 100;
        await orderPayment.save();
      }
    }
    return orders;
  }
  async cancelDiscountForOrder(
    orderPaymentId: number,
    orderId: number,
    cancelQuantity: number,
  ) {
    const orderPayment = await this.paymentModel.findById(orderPaymentId);
    if (!orderPayment) {
      throw new HttpException(
        'Order Payment not found',
        HttpStatus.BAD_REQUEST,
      );
    }
    const orderPaymentOrder = orderPayment.orders.find(
      (paymentItem) => paymentItem.order === orderId,
    );
    if (!orderPaymentOrder) {
      throw new HttpException('Order not found', HttpStatus.BAD_REQUEST);
    }
    const order = await this.orderModel.findById(orderId);
    if (!order) {
      throw new HttpException('Order not found', HttpStatus.BAD_REQUEST);
    }
    if (orderPaymentOrder.totalQuantity === cancelQuantity) {
      orderPayment.orders = [
        ...orderPayment.orders.filter(
          (paymentItem) => paymentItem.order !== orderId,
        ),
        {
          order: orderId,
          totalQuantity: order.quantity,
          paidQuantity: 0,
        },
      ];
      orderPayment.discountAmount =
        orderPayment.discountAmount -
        (order.quantity *
          order.unitPrice *
          orderPaymentOrder.discountPercentage) /
          100;
      await orderPayment.save();
    } else {
      const { _id, ...orderDataWithoutId } = order.toObject();
      const newOrder = new this.orderModel({
        ...orderDataWithoutId,
        quantity: cancelQuantity,
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
        }
      } catch (error) {
        throw new HttpException(
          'Failed to update order',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      const foundOrderPaymentItem = orderPayment.orders.find(
        (paymentItem) => paymentItem.order === orderId,
      );
      // Add the new order and update the old order in orderPayment
      const newOrders = [
        ...orderPayment.orders.filter(
          (paymentItem) => paymentItem.order !== orderId,
        ),
        {
          order: newOrder._id,
          totalQuantity: newOrder.quantity,
          paidQuantity: 0,
        },
      ];
      if (foundOrderPaymentItem?.totalQuantity - newOrder.quantity !== 0) {
        newOrders.push({
          order: orderId,
          totalQuantity:
            foundOrderPaymentItem?.totalQuantity - newOrder.quantity,
          paidQuantity: foundOrderPaymentItem?.paidQuantity || 0,
          discount: foundOrderPaymentItem?.discount || 0,
          discountPercentage: foundOrderPaymentItem?.discountPercentage || 0,
        });
      }
      orderPayment.orders = newOrders;
      orderPayment.discountAmount =
        orderPayment.discountAmount -
        (newOrder.quantity *
          newOrder.unitPrice *
          orderPaymentOrder.discountPercentage) /
          100;
      await orderPayment.save();
    }
    return orderPayment;
  }
}
