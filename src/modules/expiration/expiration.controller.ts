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
    @Body() createExpirationListDto: CreateExpirationListDto,
  ) {
    return this.expirationService.createExpirationList(createExpirationListDto);
  }

  @Patch('/lists/:id')
  updateExpirationList(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<ExpirationList>,
  ) {
    return this.expirationService.updateExpirationList(id, updates);
  }

  @Get('/counts')
  getExpirationCounts() {
    return this.expirationService.findAllExpirationCounts();
  }

  @Post('/counts')
  createExpirationCount(
    @Body() createExpirationCountDto: CreateExpirationCountDto,
  ) {
    return this.expirationService.createExpirationCount(
      createExpirationCountDto,
    );
  }

  @Patch('/counts/:id')
  updateExpirationCount(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<ExpirationCount>,
  ) {
    return this.expirationService.updateExpirationCount(id, updates);
  }

  @Delete('/counts/:id')
  removeExpirationCount(@Param('id') id: string) {
    this.expirationService.removeExpirationCount(id);
  }
}
