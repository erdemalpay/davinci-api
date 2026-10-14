import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { N11CronService } from './n11.cron.service';
import {
  MatchN11ItemsDto,
  UpdateN11PriceDto,
  UpdateN11StockDto,
} from './n11.dto';
import { N11Service } from './n11.service';

@Controller('n11')
export class N11Controller {
  constructor(
    private readonly n11Service: N11Service,
    private readonly n11CronService: N11CronService,
  ) {}

  @Get('/products')
  getAllProducts() {
    return this.n11Service.getAllProducts();
  }

  @Post('/update-all-stocks')
  updateAllStocks() {
    return this.n11Service.updateAllStocks();
  }

  @Post('/update-all-prices')
  updateAllPrices() {
    return this.n11Service.updateAllPrices();
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

  @Post('/match-items-by-barcode')
  matchItemsByBarcode(@Body() body: MatchN11ItemsDto) {
    return this.n11Service.matchItemsByBarcode(body.itemIds);
  }

  @Post('/sync-orders')
  syncOrders() {
    return this.n11CronService.triggerManualOrderSync();
  }

  @Post('/process-accepted-claims')
  processAcceptedClaims() {
    return this.n11CronService.triggerManualClaimsProcessing();
  }
}
