import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../user/user.schema';
import {
  CreateNotificationDto,
  NotificationQueryDto,
} from './notification.dto';
import { NotificationGateway } from './notification.gateway';
import { Notification } from './notification.schema';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async findAllNotifications(query: NotificationQueryDto) {
    const { after, before } = query;
    const filterQuery = {};
    if (after) {
      const startDate = new Date(after);
      startDate.setUTCHours(0, 0, 0, 0);
      filterQuery['createdAt'] = { $gte: startDate };
    }
    if (before) {
      const endDate = new Date(before);
      endDate.setUTCHours(23, 59, 59, 999);
      filterQuery['createdAt'] = {
        ...filterQuery['createdAt'],
        $lte: endDate,
      };
    }
    try {
      const notifications = await this.notificationModel
        .find(filterQuery)
        .sort({ createdAt: -1 })
        .exec();
      return notifications;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch notifications',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findUserNewNotifications(user: User) {
    try {
      const notifications = await this.notificationModel
        .find({
          seenBy: { $ne: user._id },
          $or: [{ selectedUsers: user._id }, { selectedRoles: user.role }],
        })
        .sort({ createdAt: -1 })
        .exec();
      return notifications;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch notifications',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  async findUserAllNotifications(user: User, query: NotificationQueryDto) {
    const { after, before } = query;
    const filterQuery: any = {
      $or: [{ selectedUsers: user._id }, { selectedRoles: user.role }],
    };

    if (after) {
      const startDate = new Date(after);
      startDate.setUTCHours(0, 0, 0, 0);
      filterQuery['createdAt'] = { $gte: startDate };
    }

    if (before) {
      const endDate = new Date(before);
      endDate.setUTCHours(23, 59, 59, 999);
      filterQuery['createdAt'] = {
        ...(filterQuery['createdAt'] || {}),
        $lte: endDate,
      };
    }
    try {
      const notifications = await this.notificationModel
        .find(filterQuery)
        .sort({ createdAt: -1 })
        .exec();
      return notifications;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch notifications',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

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

  async markAsRead(user: User, notificationId: number) {
    try {
      const notification = await this.notificationModel
        .findOneAndUpdate(
          { _id: notificationId, seenBy: { $ne: user._id } },
          { $push: { seenBy: user._id } },
          { new: true },
        )
        .exec();
      if (!notification) {
        throw new HttpException('Notification not found', HttpStatus.NOT_FOUND);
      }
      this.notificationGateway.emitNotificationChanged(
        notification,
        notification?.selectedUsers ?? [],
        notification?.selectedRoles ?? [],
        notification?.selectedLocations ?? [],
      );
      return notification;
    } catch (error) {
      throw new HttpException(
        'Failed to mark notification as read',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
