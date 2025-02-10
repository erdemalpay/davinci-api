import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UpdateQuery } from 'mongoose';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { CreateExpirationListDto } from './expiration.dto';
import { ExpirationService } from './expiration.service';
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
}
