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

@Controller('/visits')
export class VisitController {
  constructor(private readonly visitService: VisitService) {}

  @Get('/all')
  getVisits(@Query('date') date: string, @Query('location') location: number) {
    return this.visitService.findByDateAndLocation(date, location);
  }

  @Post('/')
  createVisit(@Body() visitDto: VisitDto) {
    return this.visitService.create(visitDto);
  }

  @Patch('/:id')
  updateVisit(@Param('id') id: number, @Body() visitDto: VisitDto) {
    return this.updateVisit(id, visitDto);
  }
}
