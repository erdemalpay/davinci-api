import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { MarketplaceController } from '../order/marketplace.controller';
import { N11CronService } from './n11.cron.service';
import { UpdateN11PriceDto, UpdateN11StockDto } from './n11.dto';
import { N11Service } from './n11.service';

@Controller('n11')
export class N11Controller extends MarketplaceController {
  constructor(
    private readonly n11Service: N11Service,
    n11CronService: N11CronService,
  ) {
    super(n11Service, n11CronService);
  }

  @Post('/update-stock')
  updateStock(@Body() body: UpdateN11StockDto) {
    return this.n11Service.updateStock(body.stockCode, body.quantity);
  }

  @Post('/update-price')
  updatePrice(@Body() body: UpdateN11PriceDto) {
    return this.n11Service.updatePrice(body.stockCode, body.price);
  }

  @Get('/task/:taskId')
  getTaskDetail(@Param('taskId') taskId: string) {
    return this.n11Service.getTaskDetail(Number(taskId));
  }
}
