import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotificationEventType } from '../../notification/notification.dto';
import { NotificationService } from '../../notification/notification.service';
import { User } from '../../user/user.schema';
import { Shift } from '../shift.schema';
import { ShiftService } from '../shift.service';
import {
  CreateShiftChangeRequestDto,
  ShiftChangeRequestFilterDto,
  UpdateShiftChangeRequestDto,
} from './shiftChangeRequest.dto';
import { ShiftChangeStatus, ShiftChangeType } from './shiftChangeRequest.enums';
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
  ) {}

  async createRequest(
    requesterId: string,
    createDto: CreateShiftChangeRequestDto,
  ) {
    // Validate requester is in requesterShift
    if (createDto.requesterShift.userId !== requesterId) {
      throw new HttpException(
        'Requester must be in requester shift',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate target user is in targetShift
    if (createDto.targetShift.userId !== createDto.targetUserId) {
      throw new HttpException(
        'Target user must be in target shift',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check for shift overlaps (especially important for TRANSFER)
    if (createDto.type === ShiftChangeType.TRANSFER) {
      // Target user will receive requester's shift, check if it overlaps with their existing shifts
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
      //swapta böyle bir kontrole gerek var mı?
    } else if (createDto.type === ShiftChangeType.SWAP) {
      // In swap, check both users for overlaps
      const requesterHasOverlap = await this.checkShiftOverlap(
        requesterId,
        createDto.targetShift.day,
        createDto.targetShift.startTime,
        createDto.targetShift.endTime,
        createDto.targetShift.shiftId,
      );

      const targetHasOverlap = await this.checkShiftOverlap(
        createDto.targetUserId,
        createDto.requesterShift.day,
        createDto.requesterShift.startTime,
        createDto.requesterShift.endTime,
        createDto.requesterShift.shiftId,
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

    // Send notification to target user
    await this.notificationService.createNotification({
      message: {
        key: 'SHIFT_CHANGE_REQUESTED',
        params: {
          requesterId,
          day: createDto.requesterShift.day,
          startTime: createDto.requesterShift.startTime,
        },
      },
      type: 'INFORMATION',
      selectedUsers: [createDto.targetUserId],
      event: NotificationEventType.SHIFTCHANGEREQUESTED,
    });

    // Send notification to managers
    // Note: You need to implement getManagerUsers() or use roles
    // For now, we'll send to all users with manager role
    await this.notificationService.createNotification({
      message: {
        key: 'SHIFT_CHANGE_REQUESTED',
        params: {
          requesterId,
          targetUserId: createDto.targetUserId,
        },
      },
      type: 'INFORMATION',
      selectedRoles: [1], // Assuming 1 is manager role
      event: NotificationEventType.SHIFTCHANGEREQUESTED,
    });

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

  async approveRequest(
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

    // Perform shift change based on type
    if (request.type === ShiftChangeType.SWAP) {
      await this.swapShifts(request);
    } else if (request.type === ShiftChangeType.TRANSFER) {
      await this.transferShift(request);
    }

    // Update request
    request.status = ShiftChangeStatus.APPROVED;
    request.processedByManagerId = managerId;
    request.processedAt = new Date();
    if (updateDto.managerNote) {
      request.managerNote = updateDto.managerNote;
    }
    await request.save();

    // Send notifications to both users
    await this.notificationService.createNotification({
      message: {
        key: 'SHIFT_CHANGE_APPROVED',
        params: {
          managerId,
        },
      },
      type: 'SUCCESS',
      selectedUsers: [request.requesterId, request.targetUserId],
      event: NotificationEventType.SHIFTCHANGEAPPROVED,
    });

    return request;
  }

  async rejectRequest(
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

    // Update request
    request.status = ShiftChangeStatus.REJECTED;
    request.processedByManagerId = managerId;
    request.processedAt = new Date();
    if (updateDto.managerNote) {
      request.managerNote = updateDto.managerNote;
    }
    await request.save();

    // Send notifications to both users
    await this.notificationService.createNotification({
      message: {
        key: 'SHIFT_CHANGE_REJECTED',
        params: {
          managerId,
          reason: updateDto.managerNote || '',
        },
      },
      type: 'WARNING',
      selectedUsers: [request.requesterId, request.targetUserId],
      event: NotificationEventType.SHIFTCHANGEREJECTED,
    });

    return request;
  }

  private async swapShifts(request: ShiftChangeRequest) {
    const { requesterShift, targetShift } = request;

    // Remove requester from their shift and add to target shift
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

    // Remove target from their shift and add to requester shift
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
    // Find the shift document and remove user from the specific shift time slot
    // Note: 'shifts.shift' in query refers to the original schema field name
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
    // ShiftService.addShift uses 'shift' parameter name (original schema)
    await this.shiftService.addShift(day, startTime, location, userId, endTime);
  }

  private async transferShift(request: ShiftChangeRequest) {
    const { requesterShift, targetUserId } = request;

    // Remove requester from their shift
    await this.removeUserFromShift(
      requesterShift.day,
      requesterShift.startTime,
      requesterShift.location,
      requesterShift.userId,
    );

    // Add target user to requester's shift (target keeps their own shift)
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
    // Find all shifts for this user on this day
    const shifts = await this.shiftModel
      .find({
        day,
        'shifts.user': userId,
      })
      .exec();

    if (!shifts || shifts.length === 0) {
      return false;
    }

    // Parse the times for comparison
    const [reqStartHour, reqStartMin] = startTime.split(':').map(Number);
    const reqStartMinutes = reqStartHour * 60 + reqStartMin;

    let reqEndMinutes: number;
    if (endTime) {
      const [reqEndHour, reqEndMin] = endTime.split(':').map(Number);
      reqEndMinutes = reqEndHour * 60 + reqEndMin;
    } else {
      // If no end time, assume 8 hour shift
      reqEndMinutes = reqStartMinutes + 8 * 60;
    }

    // Check each shift for overlap
    for (const shiftDoc of shifts) {
      // Skip the shift we're trying to swap/transfer
      if (excludeShiftId && shiftDoc._id === excludeShiftId) {
        continue;
      }

      for (const shiftValue of shiftDoc.shifts) {
        // Check if user is in this shift
        if (!shiftValue.user.includes(userId)) {
          continue;
        }

        // Skip if it's the same shift time (this is the shift being given away)
        if (shiftValue.shift === startTime && shiftDoc._id === excludeShiftId) {
          continue;
        }

        // Parse existing shift times
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

        // Check for overlap
        // Two time ranges overlap if: start1 < end2 && start2 < end1
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
