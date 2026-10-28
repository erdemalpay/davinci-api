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
import {
  CreateStaffLeaveDto,
  CreateStaffLeaveTypeDto,
  StaffLeaveQueryDto,
} from './staffLeave.dto';
import { StaffLeave, StaffLeaveType } from './staffLeave.schema';
import { StaffLeaveService } from './staffLeave.service';

@Controller('staff-leave')
export class StaffLeaveController {
  constructor(private readonly staffLeaveService: StaffLeaveService) {}

  @Get('/types')
  findTypes() {
    return this.staffLeaveService.findTypes();
  }

  @Post('/types')
  createType(@Body() dto: CreateStaffLeaveTypeDto) {
    return this.staffLeaveService.createType(dto);
  }

  @Patch('/types/:id')
  updateType(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<StaffLeaveType>,
  ) {
    return this.staffLeaveService.updateType(id, updates);
  }

  @Get()
  findAll(@Query() query: StaffLeaveQueryDto) {
    return this.staffLeaveService.findAll(query);
  }

  @Post()
  create(@ReqUser() user: User, @Body() dto: CreateStaffLeaveDto) {
    return this.staffLeaveService.create(user, dto);
  }

  @Patch(':id')
  update(@Param('id') id: number, @Body() updates: UpdateQuery<StaffLeave>) {
    return this.staffLeaveService.update(id, updates);
  }

  @Delete(':id')
  remove(@Param('id') id: number) {
    return this.staffLeaveService.remove(id);
  }
}
