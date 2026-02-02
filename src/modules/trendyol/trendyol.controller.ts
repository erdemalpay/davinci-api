import { Controller, Get, Query } from '@nestjs/common';
import { GetTrendyolOrdersQueryDto } from './trendyol.dto';
import { TrendyolService } from './trendyol.service';

@Controller('trendyol')
export class TrendyolController {
  constructor(private readonly trendyolService: TrendyolService) {}

  @Get('/order')
  getAllOrders(@Query() query: GetTrendyolOrdersQueryDto) {
    return this.trendyolService.getAllOrders(query);
  }
}
