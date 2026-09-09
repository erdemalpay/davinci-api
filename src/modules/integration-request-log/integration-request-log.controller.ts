import { Controller, Get, Query } from '@nestjs/common';
import { GetIntegrationRequestLogsQueryDto } from './integration-request-log.dto';
import { IntegrationRequestLogService } from './integration-request-log.service';

@Controller('integration-request-log')
export class IntegrationRequestLogController {
  constructor(
    private readonly integrationRequestLogService: IntegrationRequestLogService,
  ) {}

  @Get('/query')
  async getAllIntegrationRequestLogs(
    @Query() query: GetIntegrationRequestLogsQueryDto,
  ) {
    const filters: any = {};

    if (query.source) {
      filters.source = query.source;
    }

    if (query.method) {
      filters.method = query.method;
    }

    if (query.status) {
      filters.status = query.status;
    }

    if (query.startDate) {
      filters.startDate = new Date(query.startDate);
    }

    if (query.endDate) {
      filters.endDate = new Date(query.endDate);
    }

    return await this.integrationRequestLogService.findAll(
      query.page,
      query.limit,
      filters,
    );
  }
}
