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

  @Post('/set-checklists-order')
  setChecklistsOrder() {
    return this.checklistService.setChecklistsOrder();
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
  @Get('/check/query')
  findQueryCounts(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('createdBy') createdBy?: string,
    @Query('checklist') checklist?: string,
    @Query('location') location?: number | string,
    @Query('date') date?: string,
    @Query('after') after?: string,
    @Query('before') before?: string,
    @Query('sort') sort?: string,
    @Query('asc') asc?: number | '1' | '0' | '-1',
  ) {
    return this.checklistService.findQueryChecks({
      page,
      limit,
      createdBy,
      checklist,
      location,
      date,
      after,
      before,
      sort,
      asc: typeof asc === 'string' ? Number(asc) : asc,
    });
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
