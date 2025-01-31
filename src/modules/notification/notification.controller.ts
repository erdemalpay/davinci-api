import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { CreateNotificationDto } from './notification.dto';
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
      user,
      createNotificationDto,
    );
  }

  @Post('/mark-as-read')
  markAsRead(
    @ReqUser() user: User,
    @Body()
    payload: {
      id: number;
    },
  ) {
    return this.notificationService.markAsRead(user, payload.id);
  }

  @Get()
  findAllNotifications(
    @Query('after') after?: string,
    @Query('before') before?: string,
  ) {
    return this.notificationService.findAllNotifications({
      after,
      before,
    });
  }

  @Get('/new')
  findUserNewNotifications(@ReqUser() user: User) {
    return this.notificationService.findUserNewNotifications(user);
  }

  @Get('/all')
  findUserAllNotifications(
    @ReqUser() user: User,
    @Query('after') after?: string,
    @Query('before') before?: string,
  ) {
    return this.notificationService.findUserAllNotifications(user, {
      after,
      before,
    });
  }
}
