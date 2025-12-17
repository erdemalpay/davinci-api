import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LocationService } from '../../location/location.service';
import { NotificationEventType } from '../../notification/notification.dto';
import { NotificationService } from '../../notification/notification.service';
import { UserService } from '../../user/user.service';
import { AppWebSocketGateway } from '../../websocket/websocket.gateway';
import { Shift } from '../shift.schema';
import { ShiftService } from '../shift.service';
import {
  CreateShiftChangeRequestDto,
  ShiftChangeRequestFilterDto,
  UpdateShiftChangeRequestDto,
} from './shiftChangeRequest.dto';
import {
  ApprovalStatus,
  ShiftChangeStatus,
  ShiftChangeType,
} from './shiftChangeRequest.enums';
import { ShiftChangeRequest } from './shiftChangeRequest.schema';

@Injectable()
export class ShiftChangeRequestService {
  constructor(
    @InjectModel(ShiftChangeRequest.name)
    private shiftChangeRequestModel: Model<ShiftChangeRequest>,
    @InjectModel(Shift.name)
    private shiftModel: Model<Shift>,
    private readonly shiftService: ShiftService,
    private readonly notificationService: NotificationService,
    private readonly userService: UserService,
    private readonly locationService: LocationService,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  private async getUserNames(
    userIds: (string | undefined | null)[],
  ): Promise<Record<string, string>> {
    const uniqueIds = [
      ...new Set(userIds.filter((id): id is string => Boolean(id))),
    ];
    if (!uniqueIds.length) {
      return {};
    }

    const users = await Promise.all(
      uniqueIds.map((id) => this.userService.findById(id)),
    );
    return uniqueIds.reduce<Record<string, string>>((acc, id, index) => {
      acc[id] = users[index]?.name ?? id;
      return acc;
    }, {});
  }

  private async getLocationNames(
    locationIds: (number | undefined | null)[],
  ): Promise<Record<number, string>> {
    const uniqueIds = [
      ...new Set(locationIds.filter((id): id is number => id != null)),
    ];
    if (!uniqueIds.length) {
      return {};
    }

    const locations = await Promise.all(
      uniqueIds.map((id) => this.locationService.findLocationById(id)),
    );
    return uniqueIds.reduce<Record<number, string>>((acc, id, index) => {
      acc[id] = locations[index]?.name ?? id.toString();
      return acc;
    }, {});
  }

  private async checkUserHasOtherShiftsOnDay(
    userId: string,
    day: string,
    excludeShiftId?: number,
    excludeStartTime?: string,
  ): Promise<boolean> {
    const shiftsOnDay = await this.shiftModel
      .find({
        day,
        'shifts.user': userId,
      })
      .exec();

    return shiftsOnDay?.some((shiftDoc) =>
      shiftDoc.shifts?.some((s: any) => {
        if (
          excludeShiftId &&
          excludeStartTime &&
          shiftDoc._id.toString() === excludeShiftId.toString() &&
          s.shift === excludeStartTime
        ) {
          return false;
        }
        return s.user?.includes(userId);
      }),
    );
  }

  async createRequest(
    requesterId: string,
    createDto: CreateShiftChangeRequestDto,
  ) {
    if (createDto.requesterShift.userId !== requesterId) {
      throw new HttpException(
        'Requester must be in requester shift',
        HttpStatus.BAD_REQUEST,
      );
    }

    const requesterShiftDoc = await this.shiftModel
      .findOne({
        _id: createDto.requesterShift.shiftId,
        day: createDto.requesterShift.day,
        location: createDto.requesterShift.location,
        shifts: {
          $elemMatch: {
            shift: createDto.requesterShift.startTime,
            user: requesterId,
          },
        },
      })
      .exec();

    if (!requesterShiftDoc) {
      throw new HttpException(
        'Requester shift not found or requester is not assigned to this shift',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (createDto.type === ShiftChangeType.SWAP) {
      if (createDto.targetShift.userId !== createDto.targetUserId) {
        throw new HttpException(
          'Target user must be in target shift',
          HttpStatus.BAD_REQUEST,
        );
      }

      const targetShiftDoc = await this.shiftModel
        .findOne({
          _id: createDto.targetShift.shiftId,
          day: createDto.targetShift.day,
          location: createDto.targetShift.location,
          shifts: {
            $elemMatch: {
              shift: createDto.targetShift.startTime,
              user: createDto.targetUserId,
            },
          },
        })
        .exec();

      if (!targetShiftDoc) {
        throw new HttpException(
          'Target shift not found or target user is not assigned to this shift',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    if (createDto.type === ShiftChangeType.TRANSFER) {
      const targetHasAnyShift = await this.checkUserHasOtherShiftsOnDay(
        createDto.targetUserId,
        createDto.requesterShift.day,
      );

      if (targetHasAnyShift) {
        throw new HttpException(
          'Target user already has a shift on this day. Cannot transfer shift.',
          HttpStatus.CONFLICT,
        );
      }
    } else if (createDto.type === ShiftChangeType.SWAP) {
      const sameDay =
        createDto.requesterShift.day === createDto.targetShift.day;

      if (sameDay) {
        const targetHasOtherShifts = await this.checkUserHasOtherShiftsOnDay(
          createDto.targetUserId,
          createDto.requesterShift.day,
          createDto.targetShift.shiftId,
          createDto.targetShift.startTime,
        );

        if (targetHasOtherShifts) {
          throw new HttpException(
            'Target user already has another shift on this day. Cannot swap shifts.',
            HttpStatus.CONFLICT,
          );
        }

        const requesterHasOtherShifts = await this.checkUserHasOtherShiftsOnDay(
          requesterId,
          createDto.requesterShift.day,
          createDto.requesterShift.shiftId,
          createDto.requesterShift.startTime,
        );

        if (requesterHasOtherShifts) {
          throw new HttpException(
            'You already have another shift on this day. Cannot swap shifts.',
            HttpStatus.CONFLICT,
          );
        }
      } else {
        const targetHasAnyShiftOnRequesterDay =
          await this.checkUserHasOtherShiftsOnDay(
            createDto.targetUserId,
            createDto.requesterShift.day,
            createDto.targetShift.shiftId,
            createDto.targetShift.startTime,
          );

        if (targetHasAnyShiftOnRequesterDay) {
          throw new HttpException(
            'Target user already has a shift on your shift day. Cannot swap shifts.',
            HttpStatus.CONFLICT,
          );
        }

        const requesterHasAnyShiftOnTargetDay =
          await this.checkUserHasOtherShiftsOnDay(
            requesterId,
            createDto.targetShift.day,
            createDto.requesterShift.shiftId,
            createDto.requesterShift.startTime,
          );

        if (requesterHasAnyShiftOnTargetDay) {
          throw new HttpException(
            'You already have a shift on the target day. Cannot swap shifts.',
            HttpStatus.CONFLICT,
          );
        }
      }
    }

    const request = new this.shiftChangeRequestModel({
      requesterId,
      ...createDto,
      status: ShiftChangeStatus.PENDING,
    });

    await request.save();

    const notificationEvents =
      await this.notificationService.findAllEventNotifications();
    const shiftChangeRequestedEvent = notificationEvents.find(
      (notification) =>
        notification.event === NotificationEventType.SHIFTCHANGEREQUESTED,
    );

    if (shiftChangeRequestedEvent) {
      const userNames = await this.getUserNames([
        requesterId,
        createDto.targetUserId,
      ]);
      const requesterName = userNames[requesterId] ?? 'Unknown User';
      const targetName = userNames[createDto.targetUserId] ?? 'Unknown User';

      const locationNames = await this.getLocationNames([
        createDto.requesterShift.location,
        createDto.targetShift?.location,
      ]);
      const requesterLocationName =
        locationNames[createDto.requesterShift.location] ?? 'Unknown Location';
      const targetLocationName = createDto.targetShift?.location
        ? locationNames[createDto.targetShift.location] ?? 'Unknown Location'
        : '';

      await this.notificationService.createNotification({
        message: {
          key: `ShiftChangeRequestForTarget_${createDto.type}`,
          params: {
            requesterName,
            targetName,
            requesterShiftDay: createDto.requesterShift.day,
            requesterShiftStartTime: createDto.requesterShift.startTime,
            requesterShiftEndTime: createDto.requesterShift.endTime,
            requesterShiftLocation: requesterLocationName,
            targetShiftDay: createDto.targetShift?.day || '',
            targetShiftStartTime: createDto.targetShift?.startTime || '',
            targetShiftEndTime: createDto.targetShift?.endTime || '',
            targetShiftLocation: targetLocationName,
          },
        },
        type: shiftChangeRequestedEvent.type,
        createdBy: shiftChangeRequestedEvent.createdBy,
        selectedUsers: [createDto.targetUserId],
        selectedRoles: shiftChangeRequestedEvent.selectedRoles,
        selectedLocations: shiftChangeRequestedEvent.selectedLocations,
        seenBy: [],
        event: NotificationEventType.SHIFTCHANGEREQUESTED,
      });

      await this.notificationService.createNotification({
        message: {
          key: `ShiftChangeRequestForManagers_${createDto.type}`,
          params: {
            requesterName,
            targetName,
            requesterShiftDay: createDto.requesterShift.day,
            requesterShiftStartTime: createDto.requesterShift.startTime,
            requesterShiftEndTime: createDto.requesterShift.endTime,
            requesterShiftLocation: requesterLocationName,
            targetShiftDay: createDto.targetShift?.day || '',
            targetShiftStartTime: createDto.targetShift?.startTime || '',
            targetShiftEndTime: createDto.targetShift?.endTime || '',
            targetShiftLocation: targetLocationName,
          },
        },
        type: shiftChangeRequestedEvent.type,
        createdBy: shiftChangeRequestedEvent.createdBy,
        selectedUsers: shiftChangeRequestedEvent.selectedUsers,
        selectedRoles: shiftChangeRequestedEvent.selectedRoles,
        selectedLocations: shiftChangeRequestedEvent.selectedLocations,
        seenBy: [],
        event: NotificationEventType.SHIFTCHANGEREQUESTED,
      });
    }

    this.websocketGateway.emitShiftChangeRequestChanged();
    return request;
  }

  async getMyRequests(userId: string, filterDto?: ShiftChangeRequestFilterDto) {
    const query: any = {
      $or: [{ requesterId: userId }, { targetUserId: userId }],
    };

    if (filterDto?.status) {
      query.status = filterDto.status;
    }

    if (filterDto?.after) {
      query.createdAt = { $gte: new Date(filterDto.after) };
    }

    if (filterDto?.before) {
      query.createdAt = {
        ...query.createdAt,
        $lte: new Date(filterDto.before),
      };
    }

    const page = filterDto?.page || 1;
    const limit = filterDto?.limit || 50;
    const skip = (page - 1) * limit;

    const requests = await this.shiftChangeRequestModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('requesterId', 'name fullName')
      .populate('targetUserId', 'name fullName')
      .populate('processedByManagerId', 'name fullName')
      .exec();

    const total = await this.shiftChangeRequestModel.countDocuments(query);

    return {
      data: requests,
      total,
      page,
      limit,
    };
  }

  async getAllRequests(filterDto?: ShiftChangeRequestFilterDto) {
    const query: any = {};

    if (filterDto?.status) {
      query.status = filterDto.status;
    }

    if (filterDto?.requesterId) {
      query.requesterId = filterDto.requesterId;
    }

    if (filterDto?.targetUserId) {
      query.targetUserId = filterDto.targetUserId;
    }

    if (filterDto?.after) {
      query.createdAt = { $gte: new Date(filterDto.after) };
    }

    if (filterDto?.before) {
      query.createdAt = {
        ...query.createdAt,
        $lte: new Date(filterDto.before),
      };
    }

    const page = filterDto?.page || 1;
    const limit = filterDto?.limit || 50;
    const skip = (page - 1) * limit;

    const requests = await this.shiftChangeRequestModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('requesterId', 'name fullName')
      .populate('targetUserId', 'name fullName')
      .populate('processedByManagerId', 'name fullName')
      .exec();

    const total = await this.shiftChangeRequestModel.countDocuments(query);

    return {
      data: requests,
      total,
      page,
      limit,
    };
  }

  async approveByManager(
    requestId: number,
    managerId: string,
    updateDto: UpdateShiftChangeRequestDto,
  ) {
    const request = await this.shiftChangeRequestModel.findById(requestId);

    if (!request) {
      throw new HttpException('Request not found', HttpStatus.NOT_FOUND);
    }

    if (request.status !== ShiftChangeStatus.PENDING) {
      throw new HttpException(
        'Request already processed',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (request.managerApprovalStatus === ApprovalStatus.APPROVED) {
      throw new HttpException(
        'Manager already approved this request',
        HttpStatus.BAD_REQUEST,
      );
    }

    request.managerApprovalStatus = ApprovalStatus.APPROVED;
    request.managerApprovedAt = new Date();
    request.managerApprovedBy = managerId;
    if (updateDto.managerNote) {
      request.managerNote = updateDto.managerNote;
    }

    const notificationEvents =
      await this.notificationService.findAllEventNotifications();

    if (request.targetUserApprovalStatus === ApprovalStatus.APPROVED) {
      const shiftChangeApprovedEvent = notificationEvents.find(
        (notification) =>
          notification.event === NotificationEventType.SHIFTCHANGEAPPROVED,
      );

      const userNames = await this.getUserNames([
        request.requesterId,
        request.targetUserId,
        managerId,
      ]);
      const requesterName = userNames[request.requesterId] ?? 'Unknown User';
      const targetName = userNames[request.targetUserId] ?? 'Unknown User';
      const managerName = userNames[managerId] ?? 'Unknown User';

      if (request.type === ShiftChangeType.SWAP) {
        await this.swapShifts(request);
      } else if (request.type === ShiftChangeType.TRANSFER) {
        await this.transferShift(request);
      }

      request.status = ShiftChangeStatus.APPROVED;
      request.processedByManagerId = managerId;
      request.processedAt = new Date();

      await request.save();

      if (shiftChangeApprovedEvent) {
        await this.notificationService.createNotification({
          message: {
            key: `ShiftChangeApprovedRequester_${request.type}`,
            params: {
              targetName,
              requesterName,
              managerName,
            },
          },
          type: shiftChangeApprovedEvent.type,
          createdBy: shiftChangeApprovedEvent.createdBy,
          selectedUsers: [request.requesterId],
          selectedRoles: shiftChangeApprovedEvent.selectedRoles,
          selectedLocations: shiftChangeApprovedEvent.selectedLocations,
          seenBy: [],
          event: NotificationEventType.SHIFTCHANGEAPPROVED,
        });

        await this.notificationService.createNotification({
          message: {
            key: `ShiftChangeApprovedTarget_${request.type}`,
            params: {
              requesterName,
              targetName,
              managerName,
            },
          },
          type: shiftChangeApprovedEvent.type,
          createdBy: shiftChangeApprovedEvent.createdBy,
          selectedUsers: [request.targetUserId],
          selectedRoles: shiftChangeApprovedEvent.selectedRoles,
          selectedLocations: shiftChangeApprovedEvent.selectedLocations,
          seenBy: [],
          event: NotificationEventType.SHIFTCHANGEAPPROVED,
        });

        await this.notificationService.createNotification({
          message: {
            key: `ShiftChangeApprovedManager_${request.type}`,
            params: {
              requesterName,
              targetName,
              managerName,
            },
          },
          type: shiftChangeApprovedEvent.type,
          createdBy: shiftChangeApprovedEvent.createdBy,
          selectedUsers: [managerId],
          selectedRoles: shiftChangeApprovedEvent.selectedRoles,
          selectedLocations: shiftChangeApprovedEvent.selectedLocations,
          seenBy: [],
          event: NotificationEventType.SHIFTCHANGEAPPROVED,
        });

        await this.notificationService.createNotification({
          message: {
            key: `ShiftChangeCompletedForManagers_${request.type}`,
            params: {
              requesterName,
              targetName,
              managerName,
            },
          },
          type: shiftChangeApprovedEvent.type,
          createdBy: shiftChangeApprovedEvent.createdBy,
          selectedUsers: shiftChangeApprovedEvent.selectedUsers,
          selectedRoles: shiftChangeApprovedEvent.selectedRoles,
          selectedLocations: shiftChangeApprovedEvent.selectedLocations,
          seenBy: [],
          event: NotificationEventType.SHIFTCHANGEAPPROVED,
        });
      }

      this.websocketGateway.emitShiftChangeRequestChanged();
    } else {
      const shiftChangeRequestedEvent = notificationEvents.find(
        (notification) =>
          notification.event === NotificationEventType.SHIFTCHANGEREQUESTED,
      );

      const userNames = await this.getUserNames([
        request.requesterId,
        managerId,
      ]);
      const requesterName = userNames[request.requesterId] ?? 'Unknown User';
      const managerName = userNames[managerId] ?? 'Unknown User';

      await request.save();

      if (shiftChangeRequestedEvent) {
        await this.notificationService.createNotification({
          message: {
            key: 'ShiftChangeManagerApprovedPendingTarget',
            params: {
              requesterName,
              managerName,
            },
          },
          type: shiftChangeRequestedEvent.type,
          createdBy: shiftChangeRequestedEvent.createdBy,
          selectedUsers: [request.targetUserId],
          selectedRoles: shiftChangeRequestedEvent.selectedRoles,
          selectedLocations: shiftChangeRequestedEvent.selectedLocations,
          seenBy: [],
          event: NotificationEventType.SHIFTCHANGEREQUESTED,
        });
      }

      this.websocketGateway.emitShiftChangeRequestChanged();
    }

    return request;
  }

  async approveByTargetUser(requestId: number, targetUserId: string) {
    const request = await this.shiftChangeRequestModel.findById(requestId);

    if (!request) {
      throw new HttpException('Request not found', HttpStatus.NOT_FOUND);
    }

    if (request.status !== ShiftChangeStatus.PENDING) {
      throw new HttpException(
        'Request already processed',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (request.targetUserId !== targetUserId) {
      throw new HttpException(
        'Only target user can approve this request',
        HttpStatus.FORBIDDEN,
      );
    }

    if (request.targetUserApprovalStatus === ApprovalStatus.APPROVED) {
      throw new HttpException(
        'Target user already approved this request',
        HttpStatus.BAD_REQUEST,
      );
    }

    request.targetUserApprovalStatus = ApprovalStatus.APPROVED;
    request.targetUserApprovedAt = new Date();

    const notificationEvents =
      await this.notificationService.findAllEventNotifications();

    if (request.managerApprovalStatus === ApprovalStatus.APPROVED) {
      const shiftChangeApprovedEvent = notificationEvents.find(
        (notification) =>
          notification.event === NotificationEventType.SHIFTCHANGEAPPROVED,
      );

      const userNames = await this.getUserNames([
        request.requesterId,
        request.targetUserId,
        request.managerApprovedBy,
      ]);
      const requesterName = userNames[request.requesterId] ?? 'Unknown User';
      const targetName = userNames[request.targetUserId] ?? 'Unknown User';
      const managerName =
        userNames[request.managerApprovedBy as string] ?? 'Unknown User';

      if (request.type === ShiftChangeType.SWAP) {
        await this.swapShifts(request);
      } else if (request.type === ShiftChangeType.TRANSFER) {
        await this.transferShift(request);
      }

      request.status = ShiftChangeStatus.APPROVED;
      request.processedAt = new Date();

      await request.save();

      if (shiftChangeApprovedEvent) {
        await this.notificationService.createNotification({
          message: {
            key: `ShiftChangeApprovedRequester_${request.type}`,
            params: {
              requesterName,
              targetName,
              managerName,
            },
          },
          type: shiftChangeApprovedEvent.type,
          createdBy: shiftChangeApprovedEvent.createdBy,
          selectedUsers: [request.requesterId],
          selectedRoles: shiftChangeApprovedEvent.selectedRoles,
          selectedLocations: shiftChangeApprovedEvent.selectedLocations,
          seenBy: [],
          event: NotificationEventType.SHIFTCHANGEAPPROVED,
        });

        await this.notificationService.createNotification({
          message: {
            key: `ShiftChangeApprovedTarget_${request.type}`,
            params: {
              requesterName,
              targetName,
              managerName,
            },
          },
          type: shiftChangeApprovedEvent.type,
          createdBy: shiftChangeApprovedEvent.createdBy,
          selectedUsers: [request.targetUserId],
          selectedRoles: shiftChangeApprovedEvent.selectedRoles,
          selectedLocations: shiftChangeApprovedEvent.selectedLocations,
          seenBy: [],
          event: NotificationEventType.SHIFTCHANGEAPPROVED,
        });

        if (request.managerApprovedBy) {
          await this.notificationService.createNotification({
            message: {
              key: `ShiftChangeApprovedManager_${request.type}`,
              params: {
                requesterName,
                targetName,
                managerName,
              },
            },
            type: shiftChangeApprovedEvent.type,
            createdBy: shiftChangeApprovedEvent.createdBy,
            selectedUsers: [request.managerApprovedBy],
            selectedRoles: shiftChangeApprovedEvent.selectedRoles,
            selectedLocations: shiftChangeApprovedEvent.selectedLocations,
            seenBy: [],
            event: NotificationEventType.SHIFTCHANGEAPPROVED,
          });
        }

        await this.notificationService.createNotification({
          message: {
            key: `ShiftChangeCompletedForManagers_${request.type}`,
            params: {
              requesterName,
              targetName,
              managerName,
            },
          },
          type: shiftChangeApprovedEvent.type,
          createdBy: shiftChangeApprovedEvent.createdBy,
          selectedUsers: shiftChangeApprovedEvent.selectedUsers,
          selectedRoles: shiftChangeApprovedEvent.selectedRoles,
          selectedLocations: shiftChangeApprovedEvent.selectedLocations,
          seenBy: [],
          event: NotificationEventType.SHIFTCHANGEAPPROVED,
        });
      }

      this.websocketGateway.emitShiftChangeRequestChanged();
    } else {
      await request.save();

      const shiftChangeRequestedEvent = notificationEvents.find(
        (notification) =>
          notification.event === NotificationEventType.SHIFTCHANGEREQUESTED,
      );

      const userNames = await this.getUserNames([
        request.requesterId,
        request.targetUserId,
      ]);
      const requesterName = userNames[request.requesterId] ?? 'Unknown User';
      const targetName = userNames[request.targetUserId] ?? 'Unknown User';

      if (shiftChangeRequestedEvent) {
        await this.notificationService.createNotification({
          message: {
            key: 'ShiftChangeTargetApprovedPendingManager',
            params: {
              targetName,
              requesterName,
            },
          },
          type: shiftChangeRequestedEvent.type,
          createdBy: shiftChangeRequestedEvent.createdBy,
          selectedUsers: shiftChangeRequestedEvent.selectedUsers,
          selectedRoles: shiftChangeRequestedEvent.selectedRoles,
          selectedLocations: shiftChangeRequestedEvent.selectedLocations,
          seenBy: [],
          event: NotificationEventType.SHIFTCHANGEREQUESTED,
        });
      }

      this.websocketGateway.emitShiftChangeRequestChanged();
    }

    return request;
  }

  async rejectByManager(
    requestId: number,
    managerId: string,
    updateDto: UpdateShiftChangeRequestDto,
  ) {
    const request = await this.shiftChangeRequestModel.findById(requestId);

    if (!request) {
      throw new HttpException('Request not found', HttpStatus.NOT_FOUND);
    }

    if (request.status !== ShiftChangeStatus.PENDING) {
      throw new HttpException(
        'Request already processed',
        HttpStatus.BAD_REQUEST,
      );
    }

    request.status = ShiftChangeStatus.REJECTED;
    request.managerApprovalStatus = ApprovalStatus.REJECTED;
    request.processedByManagerId = managerId;
    request.processedAt = new Date();

    if (updateDto.managerNote) {
      request.managerNote = updateDto.managerNote;
    }

    await request.save();

    const notificationEvents =
      await this.notificationService.findAllEventNotifications();
    const shiftChangeRejectedEvent = notificationEvents.find(
      (notification) =>
        notification.event === NotificationEventType.SHIFTCHANGEREJECTED,
    );

    if (shiftChangeRejectedEvent) {
      const userNames = await this.getUserNames([
        request.requesterId,
        managerId,
      ]);
      const managerName = userNames[managerId] ?? 'Unknown User';
      const requesterName = userNames[request.requesterId] ?? 'Unknown User';
      const reasonText = updateDto.managerNote
        ? `: ${updateDto.managerNote}`
        : '';

      await this.notificationService.createNotification({
        message: {
          key: 'ShiftChangeRejectedByManager',
          params: {
            managerName,
            requesterName,
            reasonText,
          },
        },
        type: shiftChangeRejectedEvent.type,
        createdBy: shiftChangeRejectedEvent.createdBy,
        selectedUsers: [request.requesterId],
        selectedRoles: shiftChangeRejectedEvent.selectedRoles,
        selectedLocations: shiftChangeRejectedEvent.selectedLocations,
        seenBy: [],
        event: NotificationEventType.SHIFTCHANGEREJECTED,
      });

      await this.notificationService.createNotification({
        message: {
          key: 'ShiftChangeRejectedByManager',
          params: {
            managerName,
            requesterName,
            reasonText,
          },
        },
        type: shiftChangeRejectedEvent.type,
        createdBy: shiftChangeRejectedEvent.createdBy,
        selectedUsers: [request.targetUserId],
        selectedRoles: shiftChangeRejectedEvent.selectedRoles,
        selectedLocations: shiftChangeRejectedEvent.selectedLocations,
        seenBy: [],
        event: NotificationEventType.SHIFTCHANGEREJECTED,
      });
    }

    this.websocketGateway.emitShiftChangeRequestChanged();
    return request;
  }

  async rejectByTargetUser(requestId: number, targetUserId: string) {
    const request = await this.shiftChangeRequestModel.findById(requestId);

    if (!request) {
      throw new HttpException('Request not found', HttpStatus.NOT_FOUND);
    }

    if (request.status !== ShiftChangeStatus.PENDING) {
      throw new HttpException(
        'Request already processed',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (request.targetUserId !== targetUserId) {
      throw new HttpException(
        'Only target user can reject this request',
        HttpStatus.FORBIDDEN,
      );
    }

    request.status = ShiftChangeStatus.REJECTED;
    request.targetUserApprovalStatus = ApprovalStatus.REJECTED;
    request.processedAt = new Date();

    await request.save();

    const notificationEvents =
      await this.notificationService.findAllEventNotifications();
    const shiftChangeRejectedEvent = notificationEvents.find(
      (notification) =>
        notification.event === NotificationEventType.SHIFTCHANGEREJECTED,
    );

    if (shiftChangeRejectedEvent) {
      const userNames = await this.getUserNames([
        request.requesterId,
        targetUserId,
      ]);
      const targetName = userNames[targetUserId] ?? 'Unknown User';
      const requesterName = userNames[request.requesterId] ?? 'Unknown User';

      await this.notificationService.createNotification({
        message: {
          key: 'ShiftChangeRejectedByTarget',
          params: {
            targetName,
            requesterName,
          },
        },
        type: shiftChangeRejectedEvent.type,
        createdBy: shiftChangeRejectedEvent.createdBy,
        selectedUsers: [request.requesterId],
        selectedRoles: shiftChangeRejectedEvent.selectedRoles,
        selectedLocations: shiftChangeRejectedEvent.selectedLocations,
        seenBy: [],
        event: NotificationEventType.SHIFTCHANGEREJECTED,
      });
    }

    this.websocketGateway.emitShiftChangeRequestChanged();

    return request;
  }

  async cancelByRequester(requestId: number, requesterId: string) {
    const request = await this.shiftChangeRequestModel.findById(requestId);

    if (!request) {
      throw new HttpException('Request not found', HttpStatus.NOT_FOUND);
    }

    if (request.requesterId !== requesterId) {
      throw new HttpException(
        'Only requester can cancel this request',
        HttpStatus.FORBIDDEN,
      );
    }

    if (request.status !== ShiftChangeStatus.PENDING) {
      throw new HttpException(
        'Request already processed',
        HttpStatus.BAD_REQUEST,
      );
    }

    request.status = ShiftChangeStatus.CANCELLED;
    request.processedAt = new Date();

    await request.save();

    const notificationEvents =
      await this.notificationService.findAllEventNotifications();
    const shiftChangeRejectedEvent = notificationEvents.find(
      (notification) =>
        notification.event === NotificationEventType.SHIFTCHANGEREJECTED,
    );

    if (shiftChangeRejectedEvent) {
      const userNames = await this.getUserNames([
        requesterId,
        request.targetUserId,
      ]);
      const requesterName = userNames[requesterId] ?? 'Unknown User';
      const targetName = userNames[request.targetUserId] ?? 'Unknown User';

      await this.notificationService.createNotification({
        message: {
          key: `ShiftChangeCancelled_${request.type}`,
          params: {
            requesterName,
            targetName,
          },
        },
        type: shiftChangeRejectedEvent.type,
        createdBy: shiftChangeRejectedEvent.createdBy,
        selectedUsers: [request.targetUserId],
        selectedRoles: shiftChangeRejectedEvent.selectedRoles,
        selectedLocations: shiftChangeRejectedEvent.selectedLocations,
        seenBy: [],
        event: NotificationEventType.SHIFTCHANGEREJECTED,
      });

      await this.notificationService.createNotification({
        message: {
          key: `ShiftChangeCancelled_${request.type}`,
          params: {
            requesterName,
            targetName,
          },
        },
        type: shiftChangeRejectedEvent.type,
        createdBy: shiftChangeRejectedEvent.createdBy,
        selectedUsers: shiftChangeRejectedEvent.selectedUsers,
        selectedRoles: shiftChangeRejectedEvent.selectedRoles,
        selectedLocations: shiftChangeRejectedEvent.selectedLocations,
        seenBy: [],
        event: NotificationEventType.SHIFTCHANGEREJECTED,
      });
    }

    this.websocketGateway.emitShiftChangeRequestChanged();
    return request;
  }

  private async swapShifts(request: ShiftChangeRequest) {
    const { requesterShift, targetShift } = request;

    await this.removeUserFromShift(
      requesterShift.day,
      requesterShift.startTime,
      requesterShift.location,
      requesterShift.userId,
    );
    await this.addUserToShift(
      targetShift.day,
      targetShift.startTime,
      targetShift.location,
      requesterShift.userId,
      targetShift.endTime,
    );

    await this.removeUserFromShift(
      targetShift.day,
      targetShift.startTime,
      targetShift.location,
      targetShift.userId,
    );
    await this.addUserToShift(
      requesterShift.day,
      requesterShift.startTime,
      requesterShift.location,
      targetShift.userId,
      requesterShift.endTime,
    );
  }

  private async removeUserFromShift(
    day: string,
    startTime: string,
    location: number,
    userId: string,
  ) {
    const shiftDoc = await this.shiftModel
      .findOneAndUpdate(
        { day, location, 'shifts.shift': startTime },
        {
          $pull: { 'shifts.$.user': userId },
        },
        { new: true },
      )
      .exec();

    if (!shiftDoc) {
      throw new HttpException(
        `Shift not found for day ${day}, startTime ${startTime}, location ${location}`,
        HttpStatus.NOT_FOUND,
      );
    }

    return shiftDoc;
  }

  private async addUserToShift(
    day: string,
    startTime: string,
    location: number,
    userId: string,
    endTime?: string,
  ) {
    await this.shiftService.addShift(day, startTime, location, userId, endTime);
  }

  private async transferShift(request: ShiftChangeRequest) {
    const { requesterShift, targetUserId } = request;

    await this.removeUserFromShift(
      requesterShift.day,
      requesterShift.startTime,
      requesterShift.location,
      requesterShift.userId,
    );

    await this.addUserToShift(
      requesterShift.day,
      requesterShift.startTime,
      requesterShift.location,
      targetUserId,
      requesterShift.endTime,
    );
  }
}
