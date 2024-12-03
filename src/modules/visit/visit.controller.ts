import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { CreateVisitDto } from './create.visit.dto';
import { CafeVisitDto } from './visit.dto';
import { VisitService } from './visit.service';
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
}
