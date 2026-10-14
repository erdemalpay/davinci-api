import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { MarketplaceController } from '../order/marketplace.controller';
import { IdefixCronService } from './idefix.cron.service';
import { UpdateIdefixPriceDto, UpdateIdefixStockDto } from './idefix.dto';
import { IdefixService } from './idefix.service';

@Controller('idefix')
export class IdefixController extends MarketplaceController {
  constructor(
    private readonly idefixService: IdefixService,
    idefixCronService: IdefixCronService,
  ) {
    super(idefixService, idefixCronService);
  }

  @Post('/update-stock')
  updateStock(@Body() body: UpdateIdefixStockDto) {
    return this.idefixService.updateStock(body.barcode, body.quantity);
  }

  @Post('/update-price')
  updatePrice(@Body() body: UpdateIdefixPriceDto) {
    return this.idefixService.updatePrice(body.barcode, body.price);
  }

  @Get('/batch/:batchId')
  getInventoryResult(@Param('batchId') batchId: string) {
    return this.idefixService.getInventoryResult(batchId);
  }
}
