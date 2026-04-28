import { Body, Controller, Post } from '@nestjs/common';
import { TableFilterQueryDto } from './ai.dto';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('table-filter')
  getTableFilters(@Body() dto: TableFilterQueryDto) {
    return this.aiService.getTableFilters(dto);
  }
}
