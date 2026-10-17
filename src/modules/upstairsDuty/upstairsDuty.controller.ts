import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UpstairsDutyService } from './upstairsDuty.service';

@ApiTags('UpstairsDuty')
@Controller('upstairs-duty')
export class UpstairsDutyController {
  constructor(private readonly upstairsDutyService: UpstairsDutyService) {}

  @Get()
  find(@Query('date') date: string, @Query('location') location?: string) {
    return this.upstairsDutyService.find(
      date,
      location ? Number(location) : undefined,
    );
  }
}
