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
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { Collection } from './collection.schema';
import { CreateCollectionDto, CreateOrderDto } from './order.dto';
import { Order } from './order.schema';
import { OrderService } from './order.service';

@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}
  // orders
  @Get()
  findAllOrders() {
    return this.orderService.findAllOrders();
  }

  @Post()
  createOrder(@ReqUser() user: User, @Body() createOrderDto: CreateOrderDto) {
    return this.orderService.createOrder(user, createOrderDto);
  }

  @Patch('/update_multiple')
  updateMultipleOrders(
    @ReqUser() user: User,
    @Body('ids') ids: number[],
    @Body('status') status: string,
  ) {
    return this.orderService.updateMultipleOrders(user, ids, status);
  }

  @Patch('/delete_multiple')
  deleteMultipleOrders(@Body('ids') ids: number[]) {
    return this.orderService.removeMultipleOrders(ids);
  }
  @Get('/:date')
  findGivenDateOrders(@Param('date') date: string) {
    return this.orderService.findGivenDateOrders(date);
  }
  @Patch('/:id')
  updateOrder(@Param('id') id: number, @Body() updates: UpdateQuery<Order>) {
    return this.orderService.updateOrder(id, updates);
  }

  @Delete('/:id')
  deleteOrder(@Param('id') id: number) {
    return this.orderService.removeOrder(id);
  }
  //collections
  @Get('/collection')
  findAllCollections() {
    return this.orderService.findAllCollections();
  }

  @Post('/collection')
  createCollection(
    @ReqUser() user: User,
    @Body() createCollectionDto: CreateCollectionDto,
  ) {
    return this.orderService.createCollection(user, createCollectionDto);
  }

  @Get('/collection/:date')
  findGivenDateCollections(@Param('date') date: string) {
    return this.orderService.findGivenDateCollections(date);
  }

  @Patch('/collection/:id')
  updateCollection(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Collection>,
  ) {
    return this.orderService.updateCollection(id, updates);
  }

  @Delete('/collection/:id')
  deleteCollection(@Param('id') id: number) {
    return this.orderService.removeCollection(id);
  }
}
