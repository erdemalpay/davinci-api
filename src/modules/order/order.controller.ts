import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UpdateQuery } from 'mongoose';
import { Public } from '../auth/public.decorator';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { CreateOrderDto } from './order.dto';
import { Order } from './order.schema';
import { OrderService } from './order.service';

@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @Public()
  findAllOrders() {
    return this.orderService.findAllOrders();
  }

  @Post()
  createOrder(@ReqUser() user: User, @Body() createOrderDto: CreateOrderDto) {
    return this.orderService.createOrder(user, createOrderDto);
  }
  @Patch('/order/:id')
  updateOrder(@Param('id') id: string, @Body() updates: UpdateQuery<Order>) {
    return this.orderService.updateOrder(id, updates);
  }

  @Delete('/order/:id')
  deleteOrder(@Param('id') id: string) {
    return this.orderService.removeOrder(id);
  }
}
