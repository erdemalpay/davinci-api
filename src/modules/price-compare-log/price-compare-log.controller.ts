import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { GetPriceCompareLogsQueryDto } from './price-compare-log.dto';
import { PriceCompareLogService } from './price-compare-log.service';

@Controller('price-compare-log')
export class PriceCompareLogController {
  constructor(
    private readonly priceCompareLogService: PriceCompareLogService,
  ) {}

  @Get('/query')
  async getAllPriceCompareLogs(@Query() query: GetPriceCompareLogsQueryDto) {
    const filters: any = {};

    if (query.type) {
      filters.type = query.type;
    }

    if (query.status) {
      filters.status = query.status;
    }

    if (query.target) {
      filters.target = query.target;
    }

    if (query.startDate) {
      filters.startDate = new Date(query.startDate);
    }

    if (query.endDate) {
      filters.endDate = new Date(query.endDate);
    }

    return await this.priceCompareLogService.findAll(
      query.page,
      query.limit,
      filters,
    );
  }

  @Get(':id')
  async getPriceCompareLogById(@Param('id', ParseIntPipe) id: number) {
    const log = await this.priceCompareLogService.findById(id);
    if (!log) {
      return { success: false, message: 'Price compare log not found' };
    }
    return { success: true, log };
  }
}
