import { Controller, Get, Query } from '@nestjs/common';
import { ConcurrencyLogService } from './concurrency-log.service';

@Controller('concurrency-log')
export class ConcurrencyLogController {
  constructor(
    private readonly concurrencyLogService: ConcurrencyLogService,
  ) {}

  @Get('/endpoints')
  findDistinctEndpoints() {
    return this.concurrencyLogService.findDistinctEndpoints();
  }

  @Get('/query')
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('endpoint') endpoint?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.concurrencyLogService.findAll(
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
      {
        endpoint,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    );
  }
}
