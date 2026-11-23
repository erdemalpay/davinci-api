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
  CreateGiftDto,
  CreateGiftRecipientDto,
  CreateGiftTagDto,
  UpdateGiftDto,
  UpdateGiftRecipientDto,
  updateBodyPipe,
} from './giftTracking.dto';
import { GiftTag } from './giftTracking.schema';
import { GiftTrackingService } from './giftTracking.service';

@Controller('gift-tracking')
export class GiftTrackingController {
  constructor(private readonly giftTrackingService: GiftTrackingService) {}

  @Get('/tags')
  findTags() {
    return this.giftTrackingService.findTags();
  }

  @Post('/tags')
  createTag(@Body() dto: CreateGiftTagDto) {
    return this.giftTrackingService.createTag(dto);
  }

  @Patch('/tags/:id')
  updateTag(@Param('id') id: number, @Body() updates: UpdateQuery<GiftTag>) {
    return this.giftTrackingService.updateTag(id, updates);
  }

  @Get('/recipients')
  findRecipients() {
    return this.giftTrackingService.findRecipients();
  }

  @Post('/recipients')
  createRecipient(@Body() dto: CreateGiftRecipientDto) {
    return this.giftTrackingService.createRecipient(dto);
  }

  @Patch('/recipients/:id')
  updateRecipient(
    @Param('id') id: number,
    @Body(updateBodyPipe) updates: UpdateGiftRecipientDto,
  ) {
    return this.giftTrackingService.updateRecipient(id, updates);
  }

  @Delete('/recipients/:id')
  removeRecipient(@Param('id') id: number) {
    return this.giftTrackingService.removeRecipient(id);
  }

  @Get('/gifts')
  findGifts() {
    return this.giftTrackingService.findGifts();
  }

  @Post('/gifts')
  createGift(@ReqUser() user: User, @Body() dto: CreateGiftDto) {
    return this.giftTrackingService.createGift(user, dto);
  }

  @Patch('/gifts/:id')
  updateGift(
    @Param('id') id: number,
    @Body(updateBodyPipe) updates: UpdateGiftDto,
  ) {
    return this.giftTrackingService.updateGift(id, updates);
  }

  @Delete('/gifts/:id')
  removeGift(@Param('id') id: number) {
    return this.giftTrackingService.removeGift(id);
  }
}
