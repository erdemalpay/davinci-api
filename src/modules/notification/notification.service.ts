import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, UpdateQuery } from 'mongoose';
import { LocationService } from '../location/location.service';
import { User } from '../user/user.schema';
import { UserService } from '../user/user.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  CreateNotificationDto,
  NotificationQueryDto
} from './notification.dto';
import { Notification } from './notification.schema';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly locationService: LocationService,
    private readonly userService: UserService,
  ) {}

  parseLocalDate(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  async findQueryNotifications(query: NotificationQueryDto) {
    const {
      page = 1,
      limit = 10,
      after,
      before,
      type,
      event,
      sort,
      search,
      asc,
    } = query;

    const filter: FilterQuery<Notification> = {};

    if (type) filter.type = type;
    if (event) {
      const eventElements = event
        .split(',');

      filter.event = eventElements.length > 1
        ? { $in: eventElements }
        : eventElements[0];
    }

    const rangeFilter: Record<string, any> = {};
    if (after) {
      const start = this.parseLocalDate(after);
      rangeFilter.$gte = start;
    }
    if (before) {
      const end = this.parseLocalDate(before);
      end.setHours(23, 59, 59, 999);
      rangeFilter.$lte = end;
    }
    if (Object.keys(rangeFilter).length) {
      filter.createdAt = rangeFilter;
    }

    const sortObject: Record<string, 1 | -1> = {};
    if (sort) {
      const dir = (typeof asc === 'string' ? Number(asc) : asc) === 1 ? 1 : -1;
      sortObject[sort] = dir;
    } else {
      sortObject.createdAt = -1;
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    if (search && String(search).trim().length > 0) {
      const rx = new RegExp(String(search).trim(), 'i');
      const numeric = Number(search);
      const isNumeric = !Number.isNaN(numeric);
      const [searchedLocationIds, searchedUserIds] = await Promise.all([
        this.locationService.searchLocationIds(search),
        this.userService.searchUserIds(search),
      ]);
      const orConds: FilterQuery<Notification>[] = [
        { type: { $regex: rx } },
        { event: { $regex: rx } },
        { message: { $regex: rx } },
        ...(searchedUserIds.length
          ? [
              { createdBy: { $in: searchedUserIds } },
              { selectedUsers: { $in: searchedUserIds } },
              { seenBy: { $in: searchedUserIds } },
            ]
          : []),
        ...(searchedLocationIds.length
          ? [{ selectedLocations: { $in: searchedLocationIds } }]
          : []),
      ];
      if (isNumeric) {
        orConds.push({ _id: numeric as any });
      }
      if (orConds.length) {
        filter.$or = orConds;
      }
    }
    try {
      const [data, totalNumber] = await Promise.all([
        this.notificationModel
          .find(filter)
          .sort(sortObject)
          .skip(skip)
          .limit(limitNum)
          .lean()
          .exec(),
        this.notificationModel.countDocuments(filter),
      ]);

      const totalPages = Math.ceil(totalNumber / limitNum);

      return {
        data,
        totalNumber,
        totalPages,
        page: pageNum,
        limit: limitNum,
      };
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
          $or: [{ selectedUsers: user._id }, { selectedRoles: user.role._id }],
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
      $or: [{ selectedUsers: user._id }, { selectedRoles: user.role._id }],
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
    this.websocketGateway.emitNotificationChanged(
      [notification],
    );
    return notification;
  }

  async markAsRead(user: User, notificationIds: number[]) {
    try {
      if (!notificationIds || notificationIds.length === 0) {
        return { modifiedCount: 0, updatedIds: [] as number[] };
      }
      const accessFilter = {
        $or: [{ selectedUsers: user._id }, { selectedRoles: user.role._id }],
      };
      if (notificationIds.includes(-1)) {
        const toUpdate = await this.notificationModel
          .find({
            seenBy: { $ne: user._id },
            ...accessFilter,
          })
          .select('_id selectedUsers selectedRoles selectedLocations')
          .lean();
        if (!toUpdate.length) {
          return { modifiedCount: 0, updatedIds: [] as number[] };
        }

        const ids = toUpdate.map((n: any) => n._id);
        const { modifiedCount } = await this.notificationModel.updateMany(
          { _id: { $in: ids }, seenBy: { $ne: user._id } },
          { $addToSet: { seenBy: user._id } },
        );
        const updated = await this.notificationModel.find({
          _id: { $in: ids },
        });

        this.websocketGateway.emitNotificationChanged(updated);
        return { modifiedCount, updatedIds: ids };
      }

      const explicitIds = [
        ...new Set(notificationIds.filter((id) => id !== -1)),
      ];
      if (explicitIds.length === 0) {
        return { modifiedCount: 0, updatedIds: [] as number[] };
      }

      const toUpdate = await this.notificationModel
        .find({
          _id: { $in: explicitIds },
          seenBy: { $ne: user._id },
          ...accessFilter,
        })
        .select('_id selectedUsers selectedRoles selectedLocations')
        .lean();

      if (!toUpdate.length) {
        return { modifiedCount: 0, updatedIds: [] as number[] };
      }

      const ids = toUpdate.map((n: any) => n._id);

      const { modifiedCount } = await this.notificationModel.updateMany(
        { _id: { $in: ids }, seenBy: { $ne: user._id } },
        { $addToSet: { seenBy: user._id } },
      );

      const updated = await this.notificationModel.find({ _id: { $in: ids } });
      this.websocketGateway.emitNotificationChanged(updated);
      return { modifiedCount, updatedIds: ids };
    } catch (error) {
      throw new HttpException(
        'Failed to mark notifications as read',
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
    this.websocketGateway.emitNotificationChanged(
      [notification],
    );
    return notification;
  }

  async removeNotification(id: number) {
    try {
      const notification = await this.notificationModel.findByIdAndDelete(id);
      if (!notification) {
        throw new HttpException('Notification not found', HttpStatus.NOT_FOUND);
      }
      this.websocketGateway.emitNotificationRemoved(notification);
      return notification;
    } catch (error) {
      throw new HttpException(
        'Failed to remove notification',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
