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
import {
  CreateExpirationCountDto,
  CreateExpirationListDto,
} from './expiration.dto';
import { ExpirationService } from './expiration.service';
import { ExpirationCount } from './expirationCount.schema';
import { ExpirationList } from './expirationList.schema';

@Controller('expiration')
export class ExpirationController {
  constructor(private readonly expirationService: ExpirationService) {}

  @Get('/lists')
  getExpirationLists() {
    return this.expirationService.findAllExpirationLists();
  }

  @Post('/lists')
  createExpirationList(
    @ReqUser() user: User,
    @Body() createExpirationListDto: CreateExpirationListDto,
  ) {
    return this.expirationService.createExpirationList(
      user,
      createExpirationListDto,
    );
  }

  @Patch('/lists/:id')
  updateExpirationList(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<ExpirationList>,
  ) {
    return this.expirationService.updateExpirationList(user, id, updates);
  }

  @Get('/counts')
  getExpirationCounts() {
    return this.expirationService.findAllExpirationCounts();
  }

  @Post('/counts')
  createExpirationCount(
    @ReqUser() user: User,
    @Body() createExpirationCountDto: CreateExpirationCountDto,
  ) {
    return this.expirationService.createExpirationCount(
      user,
      createExpirationCountDto,
    );
  }

  @Patch('/counts/:id')
  updateExpirationCount(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<ExpirationCount>,
  ) {
    return this.expirationService.updateExpirationCount(user, id, updates);
  }

  @Delete('/counts/:id')
  removeExpirationCount(@ReqUser() user: User, @Param('id') id: string) {
    return this.expirationService.removeExpirationCount(user, id);
  }
}
