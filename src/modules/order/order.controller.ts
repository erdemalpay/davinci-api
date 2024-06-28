import { Body, Controller, Get, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { CreateOrderDto } from './order.dto';
import { OrderService } from './order.service';

@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @Public()
  findAll() {
    return this.orderService.findAll();
  }

  @Post()
  createExpenseType(
    @ReqUser() user: User,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return this.orderService.createOrder(user, createOrderDto);
  }
}
