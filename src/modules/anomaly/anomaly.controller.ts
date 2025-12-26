import { Controller, Get, Query, Param, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AnomalyService } from './anomaly.service';
import { AnomalyQueryDto, AnomalyReportDto } from './anomaly.dto';

@ApiTags('Anomaly Detection')
@Controller('anomaly')
export class AnomalyController {
  constructor(private readonly anomalyService: AnomalyService) {}

  @Get()
  @ApiOperation({ summary: 'Get anomalies with filters' })
  async getAnomalies(@Query() query: AnomalyQueryDto) {
    return this.anomalyService.getAnomalies(query);
  }

  @Get('report/:date')
  @ApiOperation({ summary: 'Get daily anomaly report' })
  async getDailyReport(@Param('date') date: string): Promise<AnomalyReportDto> {
    const reportDate = new Date(date);
    return this.anomalyService.generateDailyReport(reportDate);
  }

  @Patch(':id/review')
  @ApiOperation({ summary: 'Mark anomaly as reviewed' })
  async markAsReviewed(
    @Param('id') id: number,
    @Body('reviewedBy') reviewedBy: string,
  ) {
    return this.anomalyService.markAsReviewed(id, reviewedBy);
  }
}

