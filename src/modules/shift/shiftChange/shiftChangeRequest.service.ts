import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LocationService } from '../../location/location.service';
import { NotificationEventType } from '../../notification/notification.dto';
import { NotificationService } from '../../notification/notification.service';
import { UserService } from '../../user/user.service';
import { ShiftGateway } from '../shift.gateway';
import { Shift } from '../shift.schema';
import { ShiftService } from '../shift.service';
import {
  CreateShiftChangeRequestDto,
  ShiftChangeRequestFilterDto,
  UpdateShiftChangeRequestDto,
} from './shiftChangeRequest.dto';
import { ApprovalStatus, ShiftChangeStatus, ShiftChangeType } from './shiftChangeRequest.enums';
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
    private readonly shiftGateway: ShiftGateway,
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

  async createRequest(
    requesterId: string,
    createDto: CreateShiftChangeRequestDto,
  ) {
    // requester is in requesterShift validation
    if (createDto.requesterShift.userId !== requesterId) {
      throw new HttpException(
        'Requester must be in requester shift',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Verify requester shift exists in database
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

    // For SWAP, validate target user is in target shift
    // For TRANSFER, target user doesn't need to be in any shift
    if (createDto.type === ShiftChangeType.SWAP) {
      // target user is in targetShift validation
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

    // Check for shift overlaps (especially important for TRANSFER)
    if (createDto.type === ShiftChangeType.TRANSFER) {

      const hasOverlap = await this.checkShiftOverlap(
        createDto.targetUserId,
        createDto.requesterShift.day,
        createDto.requesterShift.startTime,
        createDto.requesterShift.endTime,
        createDto.requesterShift.shiftId,
      );

      if (hasOverlap) {
        throw new HttpException(
          'Target user has overlapping shift on the same day. Cannot transfer shift.',
          HttpStatus.CONFLICT,
        );
      }

    } else if (createDto.type === ShiftChangeType.SWAP) {
      // In swap, check both users for overlaps
      const requesterHasOverlap = await this.checkShiftOverlap(
        requesterId,
        createDto.targetShift.day,
        createDto.targetShift.startTime,
        createDto.targetShift.endTime,
        createDto.requesterShift.shiftId,
      );

      const targetHasOverlap = await this.checkShiftOverlap(
        createDto.targetUserId,
        createDto.requesterShift.day,
        createDto.requesterShift.startTime,
        createDto.requesterShift.endTime,
        createDto.targetShift.shiftId,
      );

      if (requesterHasOverlap) {
        throw new HttpException(
          'You have overlapping shift on the target day. Cannot swap shifts.',
          HttpStatus.CONFLICT,
        );
      }

      if (targetHasOverlap) {
        throw new HttpException(
          'Target user has overlapping shift on your shift day. Cannot swap shifts.',
          HttpStatus.CONFLICT,
        );
      }
    }

    const request = new this.shiftChangeRequestModel({
      requesterId,
      ...createDto,
      status: ShiftChangeStatus.PENDING,
    });

    await request.save();

    const userNames = await this.getUserNames([
      requesterId,
      createDto.targetUserId,
    ]);
    const requesterName = userNames[requesterId] ?? 'Unknown User';
    const targetName =
      userNames[createDto.targetUserId] ?? 'Unknown User';

    const locationNames = await this.getLocationNames([
      createDto.requesterShift.location,
      createDto.targetShift?.location,
    ]);
    const requesterLocationName = locationNames[createDto.requesterShift.location] ?? 'Unknown Location';
    const targetLocationName = createDto.targetShift?.location
      ? (locationNames[createDto.targetShift.location] ?? 'Unknown Location')
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
      type: 'INFORMATION',
      selectedUsers: [createDto.targetUserId],
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
      type: 'INFORMATION',
      selectedRoles: [1, 3, 4], // Manager (1) and GameManager (3)
      event: NotificationEventType.SHIFTCHANGEREQUESTED,
    });

    this.shiftGateway.emitShiftChangeRequestChanged({ action: 'created', request });

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

    // Mark manager approval
    request.managerApprovalStatus = ApprovalStatus.APPROVED;
    request.managerApprovedAt = new Date();
    request.managerApprovedBy = managerId;
    if (updateDto.managerNote) {
      request.managerNote = updateDto.managerNote;
    }

    // Check if both approvals are complete
    if (request.targetUserApprovalStatus === ApprovalStatus.APPROVED) {
      const userNames = await this.getUserNames([
        request.requesterId,
        request.targetUserId,
        managerId,
      ]);
      const requesterName = userNames[request.requesterId] ?? 'Unknown User';
      const targetName = userNames[request.targetUserId] ?? 'Unknown User';
      const managerName = userNames[managerId] ?? 'Unknown User';
      // Both approved, perform the shift change
      if (request.type === ShiftChangeType.SWAP) {
        await this.swapShifts(request);
      } else if (request.type === ShiftChangeType.TRANSFER) {
        await this.transferShift(request);
      }

      request.status = ShiftChangeStatus.APPROVED;
      request.processedByManagerId = managerId;
      request.processedAt = new Date();

      await request.save();

      await this.notificationService.createNotification({
        message: {
          key: `ShiftChangeApprovedRequester_${request.type}`,
          params: {
            targetName,
            requesterName,
            managerName,
          },
        },
        type: 'SUCCESS',
        selectedUsers: [request.requesterId],
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
        type: 'SUCCESS',
        selectedUsers: [request.targetUserId],
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
        type: 'SUCCESS',
        selectedUsers: [managerId],
        event: NotificationEventType.SHIFTCHANGEAPPROVED,
      });

      // Notify all managers and game managers about completed shift change
      await this.notificationService.createNotification({
        message: {
          key: `ShiftChangeCompletedForManagers_${request.type}`,
          params: {
            requesterName,
            targetName,
            managerName,
          },
        },
        type: 'SUCCESS',
        selectedRoles: [1, 3, 4], // Manager (1) and GameManager (3)
        event: NotificationEventType.SHIFTCHANGEAPPROVED,
      });

      this.shiftGateway.emitShiftChangeRequestChanged({ action: 'approved', request });
    } else {
      const userNames = await this.getUserNames([
        request.requesterId,
        managerId,
      ]);
      const requesterName = userNames[request.requesterId] ?? 'Unknown User';
      const managerName = userNames[managerId] ?? 'Unknown User';

      await request.save();

      await this.notificationService.createNotification({
        message: {
          key: 'ShiftChangeManagerApprovedPendingTarget',
          params: {
            requesterName,
            managerName,
          },
        },
        type: 'INFORMATION',
        selectedUsers: [request.targetUserId],
        event: NotificationEventType.SHIFTCHANGEREQUESTED,
      });

      this.shiftGateway.emitShiftChangeRequestChanged({ action: 'manager_approved', request });
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

    if (request.managerApprovalStatus === ApprovalStatus.APPROVED) {
      const userNames = await this.getUserNames([
        request.requesterId,
        request.targetUserId,
        request.managerApprovedBy,
      ]);
      const requesterName = userNames[request.requesterId] ?? 'Unknown User';
      const targetName = userNames[request.targetUserId] ?? 'Unknown User';
      const managerName =
        userNames[request.managerApprovedBy as string] ?? 'Unknown User';
      // Both approved, perform the shift change
      if (request.type === ShiftChangeType.SWAP) {
        await this.swapShifts(request);
      } else if (request.type === ShiftChangeType.TRANSFER) {
        await this.transferShift(request);
      }

      request.status = ShiftChangeStatus.APPROVED;
      request.processedAt = new Date();

      await request.save();

      await this.notificationService.createNotification({
        message: {
          key: `ShiftChangeApprovedRequester_${request.type}`,
          params: {
            requesterName,
            targetName,
            managerName,
          },
        },
        type: 'SUCCESS',
        selectedUsers: [request.requesterId],
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
        type: 'SUCCESS',
        selectedUsers: [request.targetUserId],
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
          type: 'SUCCESS',
          selectedUsers: [request.managerApprovedBy],
          event: NotificationEventType.SHIFTCHANGEAPPROVED,
        });
      }

      // Notify all managers and game managers about completed shift change
      await this.notificationService.createNotification({
        message: {
          key: `ShiftChangeCompletedForManagers_${request.type}`,
          params: {
            requesterName,
            targetName,
            managerName,
          },
        },
        type: 'SUCCESS',
        selectedRoles: [1, 3, 4], // Manager (1) and GameManager (3)
        event: NotificationEventType.SHIFTCHANGEAPPROVED,
      });

      this.shiftGateway.emitShiftChangeRequestChanged({ action: 'approved', request });
    } else {

      await request.save();

      const userNames = await this.getUserNames([
        request.requesterId,
        request.targetUserId,
      ]);
      const requesterName = userNames[request.requesterId] ?? 'Unknown User';
      const targetName = userNames[request.targetUserId] ?? 'Unknown User';

      await this.notificationService.createNotification({
        message: {
          key: 'ShiftChangeTargetApprovedPendingManager',
          params: {
            targetName,
            requesterName,
          },
        },
        type: 'INFORMATION',
        selectedRoles: [1, 3, 4], // Manager (1) and GameManager (3)
        event: NotificationEventType.SHIFTCHANGEREQUESTED,
      });

      this.shiftGateway.emitShiftChangeRequestChanged({ action: 'target_approved', request });
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

    // Manager rejects
    request.status = ShiftChangeStatus.REJECTED;
    request.managerApprovalStatus = ApprovalStatus.REJECTED;
    request.processedByManagerId = managerId;
    request.processedAt = new Date();

    if (updateDto.managerNote) {
      request.managerNote = updateDto.managerNote;
    }

    await request.save();

    const userNames = await this.getUserNames([
      request.requesterId,
      request.targetUserId,
      managerId,
    ]);
    const managerName = userNames[managerId] ?? 'Unknown User';
    const requesterName = userNames[request.requesterId] ?? 'Unknown User';
    const targetName = userNames[request.targetUserId] ?? 'Unknown User';
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
      type: 'WARNING',
      selectedUsers: [request.requesterId],
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
      type: 'WARNING',
      selectedUsers: [request.targetUserId],
      event: NotificationEventType.SHIFTCHANGEREJECTED,
    });

    this.shiftGateway.emitShiftChangeRequestChanged({ action: 'rejected', request });

    return request;
  }

  async rejectByTargetUser(
    requestId: number,
    targetUserId: string,
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

    if (request.targetUserId !== targetUserId) {
      throw new HttpException(
        'Only target user can reject this request',
        HttpStatus.FORBIDDEN,
      );
    }

    // Target user rejects
    request.status = ShiftChangeStatus.REJECTED;
    request.targetUserApprovalStatus = ApprovalStatus.REJECTED;
    request.processedAt = new Date();

    await request.save();

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
      type: 'WARNING',
      selectedUsers: [request.requesterId],
      event: NotificationEventType.SHIFTCHANGEREJECTED,
    });

    this.shiftGateway.emitShiftChangeRequestChanged({ action: 'rejected', request });

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

    // Requester cancels
    request.status = ShiftChangeStatus.CANCELLED;
    request.processedAt = new Date();

    await request.save();

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
      type: 'INFORMATION',
      selectedUsers: [request.targetUserId],
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
      type: 'INFORMATION',
      selectedRoles: [1, 3, 4], // Manager (1) and GameManager (3)
      event: NotificationEventType.SHIFTCHANGEREJECTED,
    });

    this.shiftGateway.emitShiftChangeRequestChanged({ action: 'cancelled', request });

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

  private async checkShiftOverlap(
    userId: string,
    day: string,
    startTime: string,
    endTime: string,
    excludeShiftId?: number,
  ): Promise<boolean> {

    const shifts = await this.shiftModel
      .find({
        day,
        'shifts.user': userId,
      })
      .exec();

    if (!shifts || shifts.length === 0) {
      return false;
    }

    const [reqStartHour, reqStartMin] = startTime.split(':').map(Number);
    const reqStartMinutes = reqStartHour * 60 + reqStartMin;

    let reqEndMinutes: number;
    if (endTime) {
      const [reqEndHour, reqEndMin] = endTime.split(':').map(Number);
      reqEndMinutes = reqEndHour * 60 + reqEndMin;
    } else {

      reqEndMinutes = reqStartMinutes + 8 * 60;
    }

    for (const shiftDoc of shifts) {
      for (const shiftValue of shiftDoc.shifts) {
        // Check if user is in this shift
        if (!shiftValue.user.includes(userId)) {
          continue;
        }

        if (
          excludeShiftId &&
          shiftDoc._id === excludeShiftId &&
          shiftValue.shift === startTime
        ) {
          continue;
        }

        const [existingStartHour, existingStartMin] = shiftValue.shift
          .split(':')
          .map(Number);
        const existingStartMinutes = existingStartHour * 60 + existingStartMin;

        let existingEndMinutes: number;
        if (shiftValue.shiftEndHour) {
          const [existingEndHour, existingEndMin] = shiftValue.shiftEndHour
            .split(':')
            .map(Number);
          existingEndMinutes = existingEndHour * 60 + existingEndMin;
        } else {
          existingEndMinutes = existingStartMinutes + 8 * 60;
        }

        const hasOverlap =
          reqStartMinutes < existingEndMinutes &&
          existingStartMinutes < reqEndMinutes;

        if (hasOverlap) {
          return true;
        }
      }
    }

    return false;
  }
}
