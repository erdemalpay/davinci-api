import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UpdateQuery } from 'mongoose';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { Collection } from './collection.schema';
import { Discount } from './discount.schema';
import {
  CreateCollectionDto,
  CreateDiscountDto,
  CreateOrderDto,
  OrderType,
} from './order.dto';
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

  @Post('/discount')
  createOrderForDiscount(
    @Body()
    payload: {
      orders: {
        totalQuantity: number;
        selectedQuantity: number;
        orderId: number;
      }[];
      discount: number;
      discountPercentage: number;
    },
  ) {
    return this.orderService.createOrderForDiscount(
      payload.orders,
      payload.discount,
      payload.discountPercentage,
    );
  }
  @Post('/cancel_discount')
  cancelDiscountForOrder(
    @Body()
    payload: {
      orderId: number;
      cancelQuantity: number;
    },
  ) {
    return this.orderService.cancelDiscountForOrder(
      payload.orderId,
      payload.cancelQuantity,
    );
  }

  @Post()
  createOrder(@ReqUser() user: User, @Body() createOrderDto: CreateOrderDto) {
    return this.orderService.createOrder(user, createOrderDto);
  }
  @Patch('/update_bulk')
  updateOrders(
    @Body()
    payload: {
      orders: OrderType[];
    },
  ) {
    return this.orderService.updateOrders(payload.orders);
  }
  @Patch('/update_multiple')
  updateMultipleOrders(
    @Body()
    payload: {
      ids: number[];
      updates: UpdateQuery<Order>;
    },
  ) {
    return this.orderService.updateMultipleOrders(payload.ids, payload.updates);
  }

  @Get('/today')
  findTodayOrders() {
    return this.orderService.findTodayOrders();
  }

  @Patch('/delete_multiple')
  deleteMultipleOrders(@Body('ids') ids: number[]) {
    return this.orderService.removeMultipleOrders(ids);
  }

  @Get('/date')
  findGivenDateOrders(
    @Query('location') location: number,
    @Query('date') date: string,
  ) {
    return this.orderService.findGivenDateOrders(date, location);
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

  @Get('/collection/date')
  findGivenDateCollections(
    @Query('location') location: number,
    @Query('date') date: string,
  ) {
    return this.orderService.findGivenDateCollections(date, location);
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
  // discount
  @Get('/discount')
  findAllDiscounts() {
    return this.orderService.findAllDiscounts();
  }

  @Post('/discount')
  createDiscount(@Body() createDiscountDto: CreateDiscountDto) {
    return this.orderService.createDiscount(createDiscountDto);
  }

  @Patch('/discount/:id')
  updateDiscount(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Discount>,
  ) {
    return this.orderService.updateDiscount(id, updates);
  }

  @Delete('/discount/:id')
  deleteDiscount(@Param('id') id: number) {
    return this.orderService.removeDiscount(id);
  }

  @Get('removeAll')
  removeAll() {
    return this.orderService.removeAll();
  }
}
