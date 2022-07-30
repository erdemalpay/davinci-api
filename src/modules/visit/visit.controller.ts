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
import { VisitDto } from './visit.dto';
import { CreateVisitDto } from './create.visit.dto';

@Controller('/visits')
export class VisitController {
  constructor(private readonly visitService: VisitService) {}

  @Get('/all')
  getVisits(@Query('date') date: string, @Query('location') location: number) {
    return this.visitService.findByDateAndLocation(date, location);
  }

  @Post('/new')
  createVisit(@Body() createVisitDto: CreateVisitDto) {
    return this.visitService.create(createVisitDto);
  }

  @Patch('/:id')
  updateVisit(@Param('id') id: number) {
    return this.visitService.finish(id);
  }
}
