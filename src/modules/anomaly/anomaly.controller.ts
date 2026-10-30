import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import {
  AnomalyQueryDto,
  RunAnomaliesDto,
  UpdateAnomalyDto,
} from './anomaly.dto';
import { AnomalyService } from './anomaly.service';

@ApiTags('Anomaly')
@Controller('anomalies')
export class AnomalyController {
  constructor(private readonly anomalyService: AnomalyService) {}

  @Get()
  find(@Query() query: AnomalyQueryDto) {
    return this.anomalyService.find(query);
  }

  // Checks a day again (e.g. after fixing a record).
  @Post('run')
  run(@Body() dto: RunAnomaliesDto) {
    return this.anomalyService.run(dto.date);
  }

  @Patch(':id')
  update(
    @ReqUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAnomalyDto,
  ) {
    return this.anomalyService.update(id, dto, user);
  }
}
