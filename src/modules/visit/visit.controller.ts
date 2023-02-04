import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { VisitService } from './visit.service';
import { CreateVisitDto } from './create.visit.dto';
import { Public } from '../auth/public.decorator';

@Controller('/visits')
export class VisitController {
  constructor(private readonly visitService: VisitService) {}

  @Public()
  @Get('/kalender')
  asyncgetKalenderVisits(
    @Query('start-date') startDate: string,
    @Query('end-date') endDate: string,
  ) {
    return this.visitService.getVisits(startDate, endDate);
  }

  @Get()
  getVisits(@Query('date') date: string, @Query('location') location: number) {
    return this.visitService.findByDateAndLocation(date, location);
  }

  @Get('/monthly')
  getMonthlyVisits(
    @Query('date') date: string,
    @Query('location') location: number,
  ) {
    return this.visitService.findMonthlyByLocation(date, location);
  }

  @Post()
  createVisit(@Body() createVisitDto: CreateVisitDto) {
    return this.visitService.create(createVisitDto);
  }

  @Patch('/finish/:id')
  finishVisit(@Param('id') id: number) {
    return this.visitService.finish(id);
  }
}
