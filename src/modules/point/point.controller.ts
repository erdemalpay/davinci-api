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
  getUserPoints(@Param('userId') userId: string) {
    return this.pointService.findUserPoints(userId);
  }

  @Get('/history')
  getAllPointHistories() {
    return this.pointService.findAllPointHistories();
  }

  @Get('/history/query')
  findAllPointHistoriesWithPagination(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('pointUser') pointUser?: string,
    @Query('status') status?: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
    @Query('sort') sort?: string,
    @Query('asc') asc?: number | '1' | '0' | '-1',
  ) {
    return this.pointService.findAllPointHistoriesWithPagination(page, limit, {
      pointUser,
      status,
      before,
      after,
      sort,
      asc: typeof asc === 'string' ? Number(asc) : asc,
    });
  }

  @Get('/history/user/:userId')
  getUserPointHistories(@Param('userId') userId: string) {
    return this.pointService.findUserPointHistories(userId);
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
