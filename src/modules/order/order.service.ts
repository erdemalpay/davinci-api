import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { endOfDay, parseISO, startOfDay } from 'date-fns';
import { Model, UpdateQuery } from 'mongoose';
import { TableService } from '../table/table.service';
import { User } from '../user/user.schema';
import { Collection } from './collection.schema';
import { CreateCollectionDto, CreateOrderDto } from './order.dto';
import { Order } from './order.schema';
@Injectable()
export class OrderService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Collection.name) private collectionModel: Model<Collection>,
    private readonly tableService: TableService,
  ) {}
  // Orders
  async findAllOrders() {
    try {
      const orders = await this.orderModel
        .find()
        .populate('location table item')
        .populate({
          path: 'createdBy preparedBy deliveredBy',
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

  async findGivenDateOrders(date: string) {
    const parsedDate = parseISO(date);
    try {
      const orders = await this.orderModel
        .find({
          createdAt: {
            $gte: startOfDay(parsedDate),
            $lte: endOfDay(parsedDate),
          },
        })
        .populate('location table item')
        .populate({
          path: 'createdBy preparedBy deliveredBy',
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
        user,
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
        .populate('location paymentMethod')
        .populate({
          path: 'createdBy',
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
  async findGivenDateCollections(date: string) {
    const parsedDate = parseISO(date);
    try {
      const collections = await this.collectionModel
        .find({
          createdAt: {
            $gte: startOfDay(parsedDate),
            $lte: endOfDay(parsedDate),
          },
        })
        .populate('location paymentMethod')
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
}
