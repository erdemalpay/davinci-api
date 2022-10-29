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
import { Visit } from './visit.schema';
import { UpdateQuery } from 'mongoose';

@Controller('/visits')
export class VisitController {
  constructor(private readonly visitService: VisitService) {}

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
