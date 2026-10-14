import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ButtonCallAssignmentService } from './buttonCall.assignment.service';
import {
  ButtonCallTypeEnum,
  CheckGameAvailabilityDto,
  GameAvailabilityStatus,
  CallReportQueryDto,
  GmCallReasonEnum,
} from './dto/create-buttonCall.dto';
import { ButtonCall } from './schemas/buttonCall.schema';
import { UnmetExplanationRequest } from './schemas/unmetExplanationRequest.schema';
import { cafeHour, cafeToday } from 'src/utils/cafeTime';

// What a table did after it couldn't get its game explained and didn't wait
// in line, judged by what it asked for in the next few minutes.
export enum UnmetFollowUp {
  OTHER_GAME = 'OTHER_GAME',
  RECOMMENDATION = 'RECOMMENDATION',
  LEFT = 'LEFT',
}

const FOLLOW_UP_WINDOW_MINUTES = 10;

const minutesOf = (hour: string) => {
  const [hours, minutes, seconds = 0] = hour.split(':').map(Number);
  return hours * 60 + minutes + seconds / 60;
};

type TableAsk = {
  date: string;
  location: number;
  tableName: string;
  hour: string;
  game?: number;
  gmCallReason?: string;
};

// Another game (a call, or another request nobody could meet) or a
// recommendation from the same table soon after; otherwise the table gave up.
export function getUnmetFollowUp(
  request: TableAsk,
  laterAsks: TableAsk[],
): UnmetFollowUp {
  const start = minutesOf(request.hour);
  const soonAfter = laterAsks.filter((ask) => {
    if (
      ask.date !== request.date ||
      ask.location !== request.location ||
      ask.tableName !== request.tableName
    ) {
      return false;
    }
    const minutes = minutesOf(ask.hour) - start;
    return minutes >= 0 && minutes <= FOLLOW_UP_WINDOW_MINUTES;
  });
  if (soonAfter.some((ask) => ask.game && ask.game !== request.game)) {
    return UnmetFollowUp.OTHER_GAME;
  }
  if (
    soonAfter.some(
      (ask) => ask.gmCallReason === GmCallReasonEnum.RECOMMENDATION,
    )
  ) {
    return UnmetFollowUp.RECOMMENDATION;
  }
  return UnmetFollowUp.LEFT;
}

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
      const key = {
        date: cafeToday(),
        location: dto.location,
        tableName: dto.tableName,
        game: dto.game,
      };
      const details = {
        status: availability.status,
        availableFrom: availability.availableFrom,
        gmCallReason: dto.gmCallReason ?? GmCallReasonEnum.EXPLANATION,
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
          hour: cafeHour(),
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

  async findAll(query: CallReportQueryDto) {
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

    // The game master calls of the days with a table that didn't wait.
    const notWaited = requests.filter((r) => !r.buttonCall);
    const tableCalls = notWaited.length
      ? await this.buttonCallModel
          .find({
            type: ButtonCallTypeEnum.GAMEMASTERCALL,
            date: { $in: [...new Set(notWaited.map((r) => r.date))] },
            location: { $in: [...new Set(notWaited.map((r) => r.location))] },
          })
          .select('date location tableName startHour game gmCallReason')
          .lean()
      : [];
    const laterAsks: TableAsk[] = [
      ...tableCalls.map((c) => ({ ...c, hour: c.startHour })),
      ...requests,
    ];

    return requests.map((request) => {
      const call = request.buttonCall
        ? callById.get(request.buttonCall)
        : undefined;
      return {
        ...request,
        waited: Boolean(request.buttonCall),
        explainedBy: call?.assignedTo,
        callFinishHour: call?.finishHour,
        ...(!request.buttonCall && {
          followUp: getUnmetFollowUp(
            request,
            laterAsks.filter((ask) => ask !== request),
          ),
        }),
      };
    });
  }
}
