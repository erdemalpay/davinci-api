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
import { CreateShiftDto, ShiftQueryDto, ShiftUserQueryDto } from './shift.dto';
import { Shift } from './shift.schema';
import { ShiftService } from './shift.service';

@Controller('/shift')
export class ShiftController {
  constructor(private readonly shiftService: ShiftService) {}

  @Get()
  findQueryShifts(@Query() query: ShiftQueryDto) {
    return this.shiftService.findQueryShifts(query);
  }

  @Get('/user')
  findUserShifts(@Query() query: ShiftUserQueryDto) {
    return this.shiftService.findUserShifts(query);
  }
  @Post()
  createShift(@ReqUser() user: User, @Body() createShiftDto: CreateShiftDto) {
    return this.shiftService.createShift(user, createShiftDto);
  }

  @Patch('/:id')
  updateShift(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Shift>,
  ) {
    return this.shiftService.updateShift(user, id, updates);
  }

  @Delete('/:id')
  removeShift(@ReqUser() user: User, @Param('id') id: number) {
    return this.shiftService.removeShift(user, id);
  }

  @Post('/copy')
  copyShift(
    @ReqUser() user: User,
    @Body()
    payload: {
      copiedDay: string;
      selectedDay: string;
      location: number;
      selectedUsers?: string[];
    },
  ) {
    return this.shiftService.copyShift(
      user,
      payload.copiedDay,
      payload.selectedDay,
      payload.location,
      payload.selectedUsers,
    );
  }

  @Post('/copy-interval')
  copyShiftInterval(
    @ReqUser() user: User,
    @Body()
    payload: {
      startCopiedDay: string;
      endCopiedDay: string;
      selectedDay: string;
      location: number;
      selectedUsers?: string[];
    },
  ) {
    return this.shiftService.copyShiftInterval(
      user,
      payload.startCopiedDay,
      payload.endCopiedDay,
      payload.selectedDay,
      payload.location,
      payload.selectedUsers,
    );
  }

  @Post('/add')
  addShift(
    @Body()
    payload: {
      day: string;
      location: number;
      shift: string;
      userId: string;
    },
  ) {
    return this.shiftService.addShift(
      payload.day,
      payload.shift,
      payload.location,
      payload.userId,
    );
  }
}
