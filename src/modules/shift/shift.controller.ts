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
import { CreateShiftDto, ShiftQueryDto } from './shift.dto';
import { Shift } from './shift.schema';
import { ShiftService } from './shift.service';

@Controller('/shift')
export class ShiftController {
  constructor(private readonly shiftService: ShiftService) {}

  @Get()
  findQueryShifts(@Query() query: ShiftQueryDto) {
    return this.shiftService.findQueryShifts(query);
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
}
