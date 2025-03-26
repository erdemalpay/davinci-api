import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UpdateQuery } from 'mongoose';
import { Public } from '../auth/public.decorator';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { CreateVisitDto } from './create.visit.dto';
import { CafeActivityDto, CafeVisitDto } from './visit.dto';
import { VisitService } from './visit.service';

@Controller('/visits')
export class VisitController {
  constructor(private readonly visitService: VisitService) {}

  @Public()
  @Get('/kalender')
  asyncgetKalenderVisits(
    @Query('start-date') startDate: string,
    @Query('end-date') endDate?: string,
  ) {
    return this.visitService.getVisits(startDate, endDate);
  }

  @Get('/panel')
  getUniqueVisits(
    @Query('start-date') startDate: string,
    @Query('end-date') endDate?: string,
  ) {
    return this.visitService.getUniqueVisits(startDate, endDate);
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
  createVisit(@ReqUser() user: User, @Body() createVisitDto: CreateVisitDto) {
    return this.visitService.create(user, createVisitDto);
  }

  @Post('/cafe')
  createVisitFromCafe(@Body() cafeVisitDto: CafeVisitDto) {
    return this.visitService.createVisitFromCafe(cafeVisitDto);
  }

  @Patch('/finish/:id')
  finishVisit(@ReqUser() user: User, @Param('id') id: number) {
    return this.visitService.finish(user, id);
  }

  @Post('/cafe-activity')
  createCafeActivity(@Body() dto: CafeActivityDto) {
    return this.visitService.createCafeActivity(dto);
  }

  @Get('/cafe-activity')
  findAllCafeActivity() {
    return this.visitService.findAllCafeActivity();
  }

  @Patch('/cafe-activity/:id')
  updateCafeActivity(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<CafeActivityDto>,
  ) {
    return this.visitService.updateCafeActivity(Number(id), updates);
  }

  @Delete('/cafe-activity/:id')
  deleteCafeActivity(@Param('id') id: number) {
    return this.visitService.deleteCafeActivity(Number(id));
  }
}
