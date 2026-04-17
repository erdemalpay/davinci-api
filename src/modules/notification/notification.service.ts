import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, UpdateQuery } from 'mongoose';
import { LocationService } from '../location/location.service';
import { User } from '../user/user.schema';
import { UserService } from '../user/user.service';
import { VisitService } from '../visit/visit.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  CreateNotificationDto,
  NotificationQueryDto,
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
    @Inject(forwardRef(() => VisitService))
    private readonly visitService: VisitService,
  ) {}

  private sanitizeSelectedLocations(locations: unknown): number[] {
    if (!Array.isArray(locations)) return [];

    return locations
      .filter(
        (location) =>
          location !== null &&
          location !== undefined &&
          String(location).trim() !== '',
      )
      .map(Number)
      .filter((location) => Number.isFinite(location));
  }

  private sanitizeNotificationUpdates(
    updates: UpdateQuery<Notification>,
  ): UpdateQuery<Notification> {
    const result: UpdateQuery<Notification> = { ...updates };

    if (result.selectedLocations !== undefined) {
      result.selectedLocations = this.sanitizeSelectedLocations(
        result.selectedLocations,
      );
    }

    if (result.$set?.selectedLocations !== undefined) {
      result.$set = {
        ...result.$set,
        selectedLocations: this.sanitizeSelectedLocations(
          result.$set.selectedLocations,
        ),
      };
    }

    return result;
  }

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
      const eventElements = event.split(',');

      filter.event =
        eventElements.length > 1 ? { $in: eventElements } : eventElements[0];
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
      const startDate = this.parseLocalDate(after);
      startDate.setHours(0, 0, 0, 0);
      filterQuery['createdAt'] = { $gte: startDate };
    }

    if (before) {
      const endDate = this.parseLocalDate(before);
      endDate.setHours(23, 59, 59, 999);
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
    let finalCreateDto: CreateNotificationDto = { ...createNotificationDto };

    if (createNotificationDto.event) {
      const eventNotifications = await this.findAllEventNotifications();
      const assignedTemplate = eventNotifications.find(
        (notification) =>
          notification.event === createNotificationDto.event &&
          notification?.isAssigned,
      );
      if (createNotificationDto?.isAssigned && assignedTemplate) {
        throw new HttpException(
          'Event notification already exists',
          HttpStatus.CONFLICT,
        );
      }
      if (
        !createNotificationDto?.isAssigned &&
        assignedTemplate?.isActive === false
      ) {
        return null;
      }
      if (!createNotificationDto?.isAssigned && assignedTemplate) {
        const selectedLocations = this.sanitizeSelectedLocations(
          assignedTemplate.selectedLocations,
        );
        finalCreateDto.selectedLocations = selectedLocations;

        if (selectedLocations.length > 0) {
          const today = new Date().toISOString().split('T')[0];
          const visitGroups = await Promise.all(
            selectedLocations.map((location) =>
              this.visitService.findByDateAndLocation(today, location),
            ),
          );
          const visits = visitGroups.flat();

          let selectedUsersList =
            visits
              ?.reduce(
                (
                  acc: {
                    unique: typeof visits;
                    seenUsers: Record<string, boolean>;
                  },
                  visit,
                ) => {
                  acc.seenUsers = acc.seenUsers || {};
                  const userId = String(visit.user ?? '');
                  if (userId && !acc.seenUsers[userId]) {
                    acc.seenUsers[userId] = true;
                    acc.unique.push(visit);
                  }
                  return acc;
                },
                { unique: [], seenUsers: {} },
              )
              ?.unique?.map((visit) => String(visit.user)) ?? [];

          if (assignedTemplate.selectedRoles?.length) {
            const users = await this.userService.findUsersByIds(
              selectedUsersList,
            );
            selectedUsersList = users
              .filter((user) =>
                assignedTemplate.selectedRoles?.some(
                  (roleId) => String(user.role?._id) === String(roleId),
                ),
              )
              .map((user) => String(user._id));
            finalCreateDto.selectedRoles = [];
          } else {
            finalCreateDto.selectedRoles = assignedTemplate.selectedRoles;
          }

          if (assignedTemplate.selectedUsers?.length) {
            selectedUsersList = [
              ...new Set([
                ...selectedUsersList,
                ...assignedTemplate.selectedUsers.map((u) => String(u)),
              ]),
            ];
          }

          finalCreateDto.selectedUsers = selectedUsersList;
        } else {
          finalCreateDto.selectedRoles = assignedTemplate.selectedRoles;
          if (assignedTemplate.selectedUsers?.length) {
            finalCreateDto.selectedUsers = assignedTemplate.selectedUsers;
          }
        }
      }
    }
    finalCreateDto.selectedLocations = this.sanitizeSelectedLocations(
      finalCreateDto.selectedLocations,
    );
    const notification = await this.notificationModel.create({
      ...finalCreateDto,
      ...(user && { createdBy: user._id }),
      createdAt: new Date(),
    });
    this.websocketGateway.emitNotificationChanged([notification]);
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
      this.sanitizeNotificationUpdates(updates),
      { new: true },
    );
    if (!notification) {
      throw new HttpException('Notification not found', HttpStatus.NOT_FOUND);
    }
    this.websocketGateway.emitNotificationChanged([notification]);
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
