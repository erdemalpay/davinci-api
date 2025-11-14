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
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { CreatePointDto } from './point.dto';
import { Point } from './point.schema';
import { PointService } from './point.service';

@Controller('point')
export class PointController {
  constructor(private readonly pointService: PointService) {}

  @Get()
  getAllPoints() {
    return this.pointService.findAllPoints();
  }

  @Get('/user/:userId')
  getUserPoints(@Param('userId') userId: number) {
    return this.pointService.findUserPoints(userId);
  }

  @Post()
  createPoint(@ReqUser() user: User, @Body() createPointDto: CreatePointDto) {
    return this.pointService.createPoint(user, createPointDto);
  }

  @Patch(':id')
  updatePoint(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Point>,
  ) {
    return this.pointService.updatePoint(user, id, updates);
  }

  @Delete(':id')
  removePoint(@ReqUser() user: User, @Param('id') id: number) {
    return this.pointService.removePoint(user, id);
  }
}
