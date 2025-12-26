import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import * as moment from 'moment-timezone';
import { AnomalyQueryDto, AnomalyReportDto } from './anomaly.dto';
import { AnomalyService } from './anomaly.service';

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

  @Post('trigger')
  @ApiOperation({ summary: 'Manually trigger daily report generation' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          format: 'date',
          description: 'Date to generate report for (YYYY-MM-DD). If not provided, generates report for previous day.',
          example: '2024-01-15',
        },
      },
    },
    required: false,
  })
  async triggerDailyReport(@Body('date') date?: string): Promise<AnomalyReportDto> {
    const reportDate = date ? new Date(date) : moment().subtract(1, 'day').toDate();
    return this.anomalyService.generateDailyReport(reportDate);
  }
}

