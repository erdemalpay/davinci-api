import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Post,
} from '@nestjs/common';
import { ShiftService } from './shift.service';
import { ShiftPlanDto, ShiftSlotDto } from './dto/shift.dto';
import { UpdateQuery } from 'mongoose';
import { ShiftPlan } from './shiftPlan.schema';

@Controller('shifts')
export class ShiftController {
  constructor(private readonly shiftService: ShiftService) {}

  @Post()
  createShiftPlan(@Body() shiftPlanDto: ShiftPlanDto) {
    return this.shiftService.createPlan(shiftPlanDto);
  }

  @Post()
  createShiftSlot(@Body() shiftSlotDto: ShiftSlotDto) {
    return this.shiftService.createSlot(shiftSlotDto);
  }

  @Get()
  findAll() {
    return this.shiftService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.shiftService.findById(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updates: UpdateQuery<ShiftPlan>) {
    return this.shiftService.update(+id, updates);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.shiftService.remove(+id);
  }
}
