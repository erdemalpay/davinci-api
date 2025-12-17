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

  @Get('/users-future-shifts/:after')
  findUsersFutureShifts(@Param('after') after: string) {
    return this.shiftService.findUsersFutureShifts(after);
  }

  @Post()
  createShift(@Body() createShiftDto: CreateShiftDto) {
    return this.shiftService.createShift(createShiftDto);
  }

  @Patch('/:id')
  updateShift(@Param('id') id: number, @Body() updates: UpdateQuery<Shift>) {
    return this.shiftService.updateShift(id, updates);
  }

  @Delete('/:id')
  removeShift(@Param('id') id: number) {
    return this.shiftService.removeShift(id);
  }

  @Post('/copy')
  copyShift(
    @Body()
    payload: {
      copiedDay: string;
      selectedDay: string;
      location: number;
      selectedUsers?: string[];
    },
  ) {
    return this.shiftService.copyShift(
      payload.copiedDay,
      payload.selectedDay,
      payload.location,
      payload.selectedUsers,
    );
  }

  @Post('/copy-interval')
  copyShiftInterval(
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
      shiftEndHour?: string;
    },
  ) {
    return this.shiftService.addShift(
      payload.day,
      payload.shift,
      payload.location,
      payload.userId,
      payload?.shiftEndHour,
    );
  }
}
