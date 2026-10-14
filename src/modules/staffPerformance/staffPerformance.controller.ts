import { Controller, Get, Query } from '@nestjs/common';
import { StaffPerformanceQueryDto } from './staffPerformance.dto';
import { StaffPerformanceService } from './staffPerformance.service';

@Controller('staff-performance')
export class StaffPerformanceController {
  constructor(
    private readonly staffPerformanceService: StaffPerformanceService,
  ) {}

  @Get('/daily-counts')
  findDailyCounts(@Query() query: StaffPerformanceQueryDto) {
    return this.staffPerformanceService.findDailyCounts(query);
  }
}
