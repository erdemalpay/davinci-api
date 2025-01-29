import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../user/user.schema';
import { CreateNotificationDto } from './notification.dto';
import { NotificationGateway } from './notification.gateway';
import { Notification } from './notification.schema';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async createNotification(
    user: User,
    createNotificationDto: CreateNotificationDto,
  ) {
    const notification = await this.notificationModel.create({
      ...createNotificationDto,
      createdBy: user._id,
      createdAt: new Date(),
    });
    this.notificationGateway.emitNotificationChanged(
      notification,
      createNotificationDto?.selectedUsers ?? [],
      createNotificationDto?.selectedRoles ?? [],
      createNotificationDto?.selectedLocations ?? [],
    );
    return notification;
  }
}
