import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { WebhookLogService } from './webhook-log.service';
import { GetWebhookLogsQueryDto } from './webhook-log.dto';

@Controller('webhook-log')
export class WebhookLogController {
  constructor(private readonly webhookLogService: WebhookLogService) {}

  @Get()
  async getAllWebhookLogs(@Query() query: GetWebhookLogsQueryDto) {
    const filters: any = {};

    if (query.source) {
      filters.source = query.source;
    }

    if (query.status) {
      filters.status = query.status;
    }

    if (query.endpoint) {
      filters.endpoint = query.endpoint;
    }

    if (query.startDate) {
      filters.startDate = new Date(query.startDate);
    }

    if (query.endDate) {
      filters.endDate = new Date(query.endDate);
    }

    return await this.webhookLogService.findAll(
      query.page,
      query.limit,
      filters,
    );
  }

  @Get(':id')
  async getWebhookLogById(@Param('id', ParseIntPipe) id: number) {
    const log = await this.webhookLogService.findById(id);
    if (!log) {
      return { success: false, message: 'Webhook log not found' };
    }
    return { success: true, log };
  }
}
