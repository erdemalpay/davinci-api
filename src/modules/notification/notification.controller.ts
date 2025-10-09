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
import { CreateNotificationDto } from './notification.dto';
import { Notification } from './notification.schema';
import { NotificationService } from './notification.service';

@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}
  @Post()
  createNotification(
    @ReqUser() user: User,
    @Body() createNotificationDto: CreateNotificationDto,
  ) {
    return this.notificationService.createNotification(
      createNotificationDto,
      user,
    );
  }

  @Post('/mark-as-read')
  markAsRead(
    @ReqUser() user: User,
    @Body()
    payload: {
      ids: number[];
    },
  ) {
    return this.notificationService.markAsRead(user, payload.ids);
  }

  @Get('/query')
  findAllNotifications(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('after') after?: string,
    @Query('before') before?: string,
    @Query('type') type?: string,
    @Query('event') event?: string,
    @Query('sort') sort?: string,
    @Query('asc') asc?: number,
  ) {
    return this.notificationService.findQueryNotifications({
      page,
      limit,
      after,
      before,
      type,
      event,
      sort,
      asc,
    });
  }

  @Get('/new')
  findUserNewNotifications(@ReqUser() user: User) {
    return this.notificationService.findUserNewNotifications(user);
  }

  @Get('/event')
  findAllEventNotifications() {
    return this.notificationService.findAllEventNotifications();
  }

  @Get('/all')
  findUserAllNotifications(
    @ReqUser() user: User,
    @Query('after') after?: string,
    @Query('before') before?: string,
    @Query('type') type?: string,
    @Query('event') event?: string,
  ) {
    return this.notificationService.findUserAllNotifications(user, {
      after,
      before,
      type,
      event,
    });
  }
  @Patch('/:id')
  updateGame(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<Notification>,
  ) {
    return this.notificationService.updateNotification(user, id, updates);
  }
  @Delete('/:id')
  deleteNotification(@Param('id') id: number) {
    return this.notificationService.removeNotification(id);
  }
}
