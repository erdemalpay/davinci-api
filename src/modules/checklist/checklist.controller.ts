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
import { Check } from './check.schema';
import { CreateCheckDto, CreateChecklistDto } from './checklist.dto';
import { Checklist } from './checklist.schema';
import { ChecklistService } from './checklist.service';
@Controller('checklist')
export class ChecklistController {
  constructor(private readonly checklistService: ChecklistService) {}

  @Get()
  getChecklist() {
    return this.checklistService.findAllChecklist();
  }

  @Post()
  createChecklist(
    @ReqUser() user: User,
    @Body() createChecklistDto: CreateChecklistDto,
  ) {
    return this.checklistService.createChecklist(user, createChecklistDto);
  }

  @Patch(':id')
  updateChecklist(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Checklist>,
  ) {
    return this.checklistService.updateChecklist(user, id, updates);
  }
  @Delete(':id')
  removeChecklist(@ReqUser() user: User, @Param('id') id: string) {
    return this.checklistService.removeChecklist(user, id);
  }

  @Get('/check')
  getChecks() {
    return this.checklistService.findAllChecks();
  }

  @Post('/check')
  createCheck(@ReqUser() user: User, @Body() createCheckDto: CreateCheckDto) {
    return this.checklistService.createCheck(user, createCheckDto);
  }

  @Patch('/check/:id')
  updateCheck(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Check>,
  ) {
    return this.checklistService.updateCheck(user, id, updates);
  }

  @Delete('/check/:id')
  removeCheck(@ReqUser() user: User, @Param('id') id: string) {
    return this.checklistService.removeCheck(user, id);
  }
}
