import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { format } from 'date-fns';
import { Model } from 'mongoose';
import { ButtonCallAssignmentService } from './buttonCall.assignment.service';
import {
  CheckGameAvailabilityDto,
  GameAvailabilityStatus,
  UnmetExplanationRequestQueryDto,
} from './dto/create-buttonCall.dto';
import { ButtonCall } from './schemas/buttonCall.schema';
import { UnmetExplanationRequest } from './schemas/unmetExplanationRequest.schema';

@Injectable()
export class UnmetExplanationRequestService {
  constructor(
    @InjectModel(UnmetExplanationRequest.name)
    private readonly unmetRequestModel: Model<UnmetExplanationRequest>,
    @InjectModel(ButtonCall.name)
    private readonly buttonCallModel: Model<ButtonCall>,
    private readonly buttonCallAssignmentService: ButtonCallAssignmentService,
  ) {}

  // Tells the table whether the game can be explained now and records the
  // request when it can't.
  async checkGameAvailability(dto: CheckGameAvailabilityDto) {
    const availability =
      await this.buttonCallAssignmentService.getGameAvailability(
        dto.location,
        dto.game,
      );
    if (availability.status !== GameAvailabilityStatus.AVAILABLE) {
      const now = new Date();
      const key = {
        date: format(now, 'yyyy-MM-dd'),
        location: dto.location,
        tableName: dto.tableName,
        game: dto.game,
      };
      const details = {
        status: availability.status,
        availableFrom: availability.availableFrom,
      };
      // One record per table and game a day, even if the table checks again.
      // (No upsert: it would skip the auto-increment _id.)
      const existing = await this.unmetRequestModel.findOneAndUpdate(key, {
        $set: details,
      });
      if (!existing) {
        await this.unmetRequestModel.create({
          ...key,
          ...details,
          hour: format(now, 'HH:mm:ss'),
        });
      }
    }
    return availability;
  }

  // The table chose to wait in line for the game: link its call so the
  // record shows how the request ended.
  async linkWaitingCall(call: ButtonCall) {
    await this.unmetRequestModel.updateOne(
      {
        date: call.date,
        location: call.location,
        tableName: call.tableName,
        game: call.game,
        buttonCall: { $exists: false },
      },
      { $set: { buttonCall: call._id } },
    );
  }

  async findAll(query: UnmetExplanationRequestQueryDto) {
    const filter: Record<string, unknown> = {};
    if (query.location) filter.location = Number(query.location);
    if (query.after || query.before) {
      filter.date = {
        ...(query.after && { $gte: query.after }),
        ...(query.before && { $lte: query.before }),
      };
    }
    const requests = await this.unmetRequestModel
      .find(filter)
      .sort({ date: -1, hour: -1 })
      .lean();

    const callIds = requests.map((r) => r.buttonCall).filter(Boolean);
    const calls = callIds.length
      ? await this.buttonCallModel
          .find({ _id: { $in: callIds } })
          .select('assignedTo finishHour')
          .lean()
      : [];
    const callById = new Map(calls.map((c) => [c._id, c]));
    return requests.map((request) => {
      const call = request.buttonCall
        ? callById.get(request.buttonCall)
        : undefined;
      return {
        ...request,
        waited: Boolean(request.buttonCall),
        explainedBy: call?.assignedTo,
        callFinishHour: call?.finishHour,
      };
    });
  }
}
