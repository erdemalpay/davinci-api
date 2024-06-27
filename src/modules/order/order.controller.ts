import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { OrderService } from './order.service';

@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @Public()
  findAll() {
    return this.orderService.findAll();
  }
}
