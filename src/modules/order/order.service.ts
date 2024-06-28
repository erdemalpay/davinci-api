import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { TableService } from '../table/table.service';
import { User } from '../user/user.schema';
import { CreateOrderDto } from './order.dto';
import { Order } from './order.schema';

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    private readonly tableService: TableService,
  ) {}

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

  async createOrder(user: User, createOrderDto: CreateOrderDto) {
    const order = new this.orderModel({
      ...createOrderDto,
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

  updateOrder(id: string, updates: UpdateQuery<Order>) {
    return this.orderModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }

  removeOrder(id: string) {
    return this.orderModel.findByIdAndRemove(id);
  }
}
