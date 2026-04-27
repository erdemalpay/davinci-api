import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UpdateQuery } from 'mongoose';
import { Public } from '../auth/public.decorator';
import { CreateMonthlyActivityDto } from './monthly-activity.dto';
import { MonthlyActivity } from './monthly-activity.schema';
import { MonthlyActivityService } from './monthly-activity.service';

@Controller('/monthly-activity')
export class MonthlyActivityController {
  constructor(
    private readonly monthlyActivityService: MonthlyActivityService,
  ) {}

  //bu endpointi panel kullanıyor.
  @Get()
  findAll() {
    return this.monthlyActivityService.findAll();
  }

  //bu endpointi davinciboardgame.com kullanıyor
  @Public()
  @Get('/latest')
  findLatest() {
    return this.monthlyActivityService.findLatest();
  }

  @Post()
  create(@Body() dto: CreateMonthlyActivityDto) {
    return this.monthlyActivityService.create(dto);
  }

  @Patch('/:id')
  update(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<MonthlyActivity>,
  ) {
    return this.monthlyActivityService.update(id, updates);
  }

  @Delete('/:id')
  remove(@Param('id') id: number) {
    return this.monthlyActivityService.remove(id);
  }
}
