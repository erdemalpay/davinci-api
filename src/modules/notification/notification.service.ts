import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
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
    const { after, before, type, event } = query;
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
    if (type) {
      filterQuery['type'] = type;
    }
    if (event) {
      filterQuery['event'] = event;
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
    const { after, before, type, event } = query;
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
    if (type) {
      filterQuery['type'] = type;
    }
    if (event) {
      filterQuery['event'] = event;
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
  async findAllEventNotifications() {
    try {
      const notifications = await this.notificationModel
        .find({ isAssigned: true })
        .sort({ createdAt: -1 })
        .exec();
      return notifications;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch event notifications',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async createNotification(
    createNotificationDto: CreateNotificationDto,
    user?: User,
  ) {
    if (createNotificationDto.event) {
      const eventNotifications = await this.findAllEventNotifications();
      const foundNotification = eventNotifications.find(
        (notification) =>
          notification.event === createNotificationDto.event &&
          notification?.isAssigned &&
          createNotificationDto?.isAssigned,
      );
      if (foundNotification) {
        throw new HttpException(
          'Event notification already exists',
          HttpStatus.CONFLICT,
        );
      }
    }
    const notification = await this.notificationModel.create({
      ...createNotificationDto,
      ...(user && { createdBy: user._id }),
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
      if (notificationId === -1) {
        const toUpdate = await this.notificationModel
          .find({
            seenBy: { $ne: user._id },
            $or: [{ selectedUsers: user._id }, { selectedRoles: user.role }],
          })
          .select('_id selectedUsers selectedRoles selectedLocations')
          .lean();

        if (!toUpdate.length) {
          return { modifiedCount: 0 };
        }

        const ids = toUpdate.map((n) => n._id);
        const { modifiedCount } = await this.notificationModel.updateMany(
          { _id: { $in: ids }, seenBy: { $ne: user._id } },
          { $addToSet: { seenBy: user._id } },
        );
        const updated = await this.notificationModel.find({
          _id: { $in: ids },
        });
        for (const n of updated) {
          this.notificationGateway.emitNotificationChanged(
            n,
            n?.selectedUsers ?? [],
            n?.selectedRoles ?? [],
            n?.selectedLocations ?? [],
          );
        }
        return { modifiedCount };
      }
      const notification = await this.notificationModel
        .findOneAndUpdate(
          { _id: notificationId, seenBy: { $ne: user._id } },
          { $addToSet: { seenBy: user._id } }, // use $addToSet to be safe
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

  async updateNotification(
    user: User,
    id: number,
    updates: UpdateQuery<Notification>,
  ) {
    const notification = await this.notificationModel.findByIdAndUpdate(
      id,
      updates,
      { new: true },
    );
    if (!notification) {
      throw new HttpException('Notification not found', HttpStatus.NOT_FOUND);
    }
    this.notificationGateway.emitNotificationChanged(
      notification,
      notification.selectedUsers,
      notification.selectedRoles,
      notification.selectedLocations,
    );
    return notification;
  }

  async removeNotification(id: number) {
    try {
      const notification = await this.notificationModel.findByIdAndDelete(id);
      if (!notification) {
        throw new HttpException('Notification not found', HttpStatus.NOT_FOUND);
      }
      this.notificationGateway.emitNotificationRemoved(notification);
      return notification;
    } catch (error) {
      throw new HttpException(
        'Failed to remove notification',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
