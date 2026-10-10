import { HttpService } from '@nestjs/axios';
import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { format } from 'date-fns';
import * as moment from 'moment-timezone';
import { Model } from 'mongoose';
import { lastValueFrom, timeout } from 'rxjs';
import { dateRanges } from 'src/utils/dateRanges';
import {
  TABLE_GAMEPLAY_ADDED,
  TableGameplayAddedEvent,
} from '../../lib/events';
import { convertToHMS, convertToSeconds } from '../../utils/timeUtils';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
import { LocationService } from '../location/location.service';
import { Table } from '../table/table.schema';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { ButtonCallAssignmentService } from './buttonCall.assignment.service';
import { CloseButtonCallDto } from './dto/close-buttonCall.dto';
import {
  ASSIGNED_CALL_TYPES,
  ButtonCallActionEnum,
  ButtonCallQueryDto,
  ButtonCallTypeEnum,
  CreateButtonCallDto,
} from './dto/create-buttonCall.dto';
import { ButtonCall } from './schemas/buttonCall.schema';
import { UnmetExplanationRequestService } from './unmetExplanationRequest.service';

@Injectable()
export class ButtonCallService {
  private readonly logger = new Logger(ButtonCallService.name);

  constructor(
    @InjectModel(ButtonCall.name)
    private readonly buttonCallModel: Model<ButtonCall>,
    private readonly httpService: HttpService,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly activityService: ActivityService,
    @Inject(forwardRef(() => LocationService))
    private readonly locationService: LocationService,
    private readonly buttonCallAssignmentService: ButtonCallAssignmentService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly unmetExplanationRequestService: UnmetExplanationRequestService,
  ) {}

  private readonly buttonCallNeoIP: string = process.env.BUTTON_CALL_NEO_IP;
  private readonly buttonCallNeoPort: string = process.env.BUTTON_CALL_NEO_PORT;

  private readonly buttonCallBahceliIP: string =
    process.env.BUTTON_CALL_BAHCELI_IP;
  private readonly buttonCallBahceliPort: string =
    process.env.BUTTON_CALL_BAHCELI_PORT;

  async create(createButtonCallDto: CreateButtonCallDto, user?: User) {
    const existingButtonCall = await this.buttonCallModel.findOne({
      tableName: createButtonCallDto.tableName,
      type: createButtonCallDto?.type ?? ButtonCallTypeEnum.TABLECALL,
      location: createButtonCallDto.location,
      finishHour: { $exists: false },
      date: format(new Date(), 'yyyy-MM-dd'),
    });
    if (existingButtonCall) {
      existingButtonCall.callCount += 1;
      await existingButtonCall.save();
      this.websocketGateway.emitButtonCallChanged(
        existingButtonCall,
        ButtonCallActionEnum.RECALL,
      );
      return existingButtonCall;
    }

    try {
      const createdButtonCall = await this.buttonCallModel.create({
        ...createButtonCallDto,
        date: format(new Date(), 'yyyy-MM-dd'),
        type: createButtonCallDto?.type ?? ButtonCallTypeEnum.TABLECALL,
        startHour: createButtonCallDto.hour,
        ...(user && { createdBy: user._id }),
      });
      this.websocketGateway.emitButtonCallChanged(
        createdButtonCall,
        ButtonCallActionEnum.CREATE,
      );
      if (
        ASSIGNED_CALL_TYPES.includes(
          createdButtonCall.type as ButtonCallTypeEnum,
        )
      ) {
        if (createdButtonCall.game) {
          await this.unmetExplanationRequestService
            .linkWaitingCall(createdButtonCall)
            .catch((error) =>
              this.logger.error('Error linking unmet request:', error),
            );
        }
        const assigned = await this.buttonCallAssignmentService
          .assign(createdButtonCall._id)
          .catch((error) => {
            this.logger.error('Error assigning button call:', error);
            return null;
          });
        return assigned ?? createdButtonCall;
      }
      return createdButtonCall;
    } catch (error) {
      throw new HttpException(
        'Failed to Create Button Call',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async close(
    user: User | null,
    closeButtonCallDto: CloseButtonCallDto,
    notifyCafe = false,
  ) {
    const closedButtonCall = await this.buttonCallModel.findOne({
      tableName: closeButtonCallDto.tableName,
      location: closeButtonCallDto.location,
      finishHour: { $exists: false },
      ...(closeButtonCallDto.type && { type: closeButtonCallDto.type }),
    });
    if (!closedButtonCall) {
      throw new HttpException('Not Found', HttpStatus.NOT_FOUND);
    }

    await this.finishButtonCall(
      closedButtonCall,
      user,
      closeButtonCallDto.hour,
    );
    this.freeAssignee(closedButtonCall);

    if (notifyCafe) {
      await this.notifyCafe(closeButtonCallDto);
    }

    return closedButtonCall;
  }

  async closeOrderCall(table: Table, user: User) {
    const activeOrderCall = await this.buttonCallModel
      .findOne({
        tableName: table.name,
        location: table.location,
        type: ButtonCallTypeEnum.ORDERCALL,
        finishHour: { $exists: false },
      })
      .sort({ createdAt: -1 });

    if (!activeOrderCall) {
      return null;
    }

    await this.finishButtonCall(
      activeOrderCall,
      user,
      moment.tz('Europe/Istanbul').format('HH:mm:ss'),
    );
    this.freeAssignee(activeOrderCall);

    return activeOrderCall;
  }

  private async finishButtonCall(
    buttonCall: ButtonCall,
    user: User | null,
    finishHour: string,
  ) {
    const obj: { duration: string; finishHour: string; cancelledBy?: string } =
      {
        duration: convertToHMS(
          convertToSeconds(finishHour) - convertToSeconds(buttonCall.startHour),
        ),
        finishHour,
      };

    if (user) {
      obj.cancelledBy = user._id;
    }

    buttonCall.set(obj);
    await buttonCall.save();
    this.websocketGateway.emitButtonCallChanged(
      buttonCall,
      ButtonCallActionEnum.CLOSE,
    );
    if (user) {
      this.activityService
        .addActivity(user, ActivityType.CLOSE_BUTTONCALL, buttonCall)
        .catch((error) => {
          this.logger.error('Error adding close button call activity:', error);
        });
    }
  }

  async notifyCafe(closeButtonCallDto: CloseButtonCallDto) {
    const location = closeButtonCallDto.location;

    if (location == 1) {
      if (!this.buttonCallBahceliIP || !this.buttonCallBahceliPort) {
        return;
      }
    } else if (location == 2) {
      if (!this.buttonCallNeoIP || !this.buttonCallNeoPort) {
        throw new HttpException(
          'IP and PORT must be specified.',
          HttpStatus.PRECONDITION_REQUIRED,
        );
      }
    }

    const apiUrl =
      'http://' +
      (location == 1 ? this.buttonCallBahceliIP : this.buttonCallNeoIP) +
      ':' +
      (location == 1 ? this.buttonCallBahceliPort : this.buttonCallNeoPort) +
      '/transmit';
    try {
      const response = await lastValueFrom(
        this.httpService
          .post(
            apiUrl,
            {
              location: closeButtonCallDto.location,
              tableName: closeButtonCallDto.tableName,
            },
            {
              headers: { 'Content-Type': 'application/json' },
            },
          )
          .pipe(timeout(10000)),
      );
    } catch (error) {
      this.logger.error('Error notifying cafe:', error.message);
    }
  }
  async averageButtonCallStats(date: string, location: number) {
    const calls = await this.buttonCallModel
      .find({
        date,
        location: Number(location),
        finishHour: { $exists: true },
      })
      .select('duration tableName finishHour')
      .exec();

    if (calls.length === 0) {
      return {
        averageDuration: '00:00:00',
        longestCalls: [],
      };
    }
    const callsWithSeconds = calls
      .map((call) => {
        const [h, m, s] = call.duration.split(':').map(Number);
        return {
          tableName: call.tableName,
          duration: call.duration,
          seconds: h * 3600 + m * 60 + s,
          finishHour: call.finishHour as string,
        };
      })
      .filter((call) => call.seconds > 15);

    if (callsWithSeconds.length === 0) {
      return {
        averageDuration: '00:00:00',
        longestCalls: [],
      };
    }

    const totalSeconds = callsWithSeconds.reduce(
      (sum, c) => sum + c.seconds,
      0,
    );
    const avgSeconds = Math.round(totalSeconds / callsWithSeconds.length);
    const hours = Math.floor(avgSeconds / 3600);
    const minutes = Math.floor((avgSeconds % 3600) / 60);
    const seconds = avgSeconds % 60;
    const averageDuration = [hours, minutes, seconds]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
    const longestCalls = callsWithSeconds
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 3)
      .map(({ tableName, duration, finishHour }) => ({
        tableName,
        duration,
        finishHour,
      }));
    return { averageDuration, longestCalls };
  }

  async find(date?: string, location?: number, type?: string) {
    const query: any = {};
    if (date) query.date = date;
    if (location !== undefined) query.location = location;
    if (type) query.finishHour = { $exists: !(type === 'active') };

    // Public endpoint: leave out the internal assignment trail.
    return this.buttonCallModel
      .find(query)
      .select('-assignmentHistory -declinedBy');
  }

  // For the public cafe TV screen: only what customers may see, with the
  // assigned game master's first name.
  async findForScreen(location: number) {
    const calls = await this.buttonCallModel
      .find({
        date: format(new Date(), 'yyyy-MM-dd'),
        location,
        finishHour: { $exists: false },
      })
      .select('tableName type startHour assignedTo')
      .lean();
    const assigneeIds = [
      ...new Set(calls.map((c) => c.assignedTo).filter(Boolean)),
    ];
    const assignees = assigneeIds.length
      ? await this.userModel
          .find({ _id: { $in: assigneeIds } })
          .select('name')
          .lean()
      : [];
    const firstNameById = new Map(
      assignees.map((u) => [u._id, (u.name ?? '').trim().split(/\s+/)[0]]),
    );
    return calls.map((call) => ({
      _id: call._id,
      tableName: call.tableName,
      type: call.type,
      startHour: call.startHour,
      ...(call.assignedTo && {
        assignedToName: firstNameById.get(call.assignedTo),
      }),
    }));
  }
  parseLocalDate(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  async findButtonCallsQuery(query: ButtonCallQueryDto) {
    const {
      page = 1,
      limit = 10,
      location,
      tableName,
      cancelledBy,
      date,
      after,
      before,
      type,
      sort,
      asc,
      search,
    } = query;

    const filter: Record<string, any> = {};

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const searchedLocationIds = await this.locationService.searchLocationIds(
        search,
      );
      filter.$or = [
        { tableName: { $regex: searchRegex } },
        { type: { $regex: searchRegex } },
        { cancelledBy: { $regex: searchRegex } },
        { location: { $in: searchedLocationIds } },
      ];
    } else {
      if (location !== undefined && location !== null && `${location}` !== '') {
        const locNum =
          typeof location === 'string'
            ? Number(location)
            : (location as number);
        if (!Number.isNaN(locNum)) filter.location = locNum;
      }
      if (tableName && `${tableName}`.trim() !== '') {
        filter.tableName = { $regex: new RegExp(`${tableName}`, 'i') };
      }
      if (cancelledBy !== undefined && cancelledBy !== null) {
        const arr = Array.isArray(cancelledBy)
          ? cancelledBy
          : `${cancelledBy}`.includes(',')
          ? `${cancelledBy}`
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [`${cancelledBy}`];
        if (arr.length) filter.cancelledBy = { $in: arr };
      }
      if (type !== undefined && type !== null) {
        const types = Array.isArray(type)
          ? type
          : `${type}`.includes(',')
          ? `${type}`
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [`${type}`];
        const wantActive = types.includes('active');
        const wantFinished = types.includes('finished');
        const concreteTypes = types.filter(
          (t) => t !== 'active' && t !== 'finished',
        );

        if (wantActive && !wantFinished) filter.finishHour = { $exists: false };
        else if (wantFinished && !wantActive)
          filter.finishHour = { $exists: true };

        if (concreteTypes.length) filter.type = { $in: concreteTypes };
      }
    }
    if (date && dateRanges[date]) {
      const { after: dAfter, before: dBefore } = dateRanges[date]();
      const start = this.parseLocalDate(dAfter);
      const end = this.parseLocalDate(dBefore);
      end.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: start, $lte: end };
    } else {
      const rangeFilter: Record<string, any> = {};
      if (after) {
        const start = this.parseLocalDate(after);
        rangeFilter.$gte = start;
      }
      if (before) {
        const endD = this.parseLocalDate(before);
        endD.setHours(23, 59, 59, 999);
        rangeFilter.$lte = endD;
      }
      if (Object.keys(rangeFilter).length) filter.createdAt = rangeFilter;
    }
    const sortObject: Record<string, 1 | -1> = {};
    if (sort) {
      const dirRaw =
        typeof asc === 'string' ? Number(asc) : (asc as number | undefined);
      const dir: 1 | -1 = dirRaw === 1 ? 1 : -1;
      sortObject[sort] = dir;
    } else {
      sortObject.createdAt = -1;
    }
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const skip = (pageNum - 1) * limitNum;
    const [data, totalNumber] = await Promise.all([
      this.buttonCallModel
        .find(filter)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .lean()
        .exec(),
      this.buttonCallModel.countDocuments(filter),
    ]);
    const totalPages = Math.ceil(totalNumber / limitNum);
    return {
      data,
      totalNumber,
      totalPages,
      page: pageNum,
      limit: limitNum,
    };
  }
  async getTodayQueuePositionsByType(query: {
    tableName: string;
    location?: number;
  }) {
    const { tableName, location } = query;

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const filter: Record<string, any> = {
      finishHour: { $exists: false },
      createdAt: { $gte: start, $lte: end },
      date: format(new Date(), 'yyyy-MM-dd'),
    };
    if (location !== undefined) filter.location = location;

    type Row = {
      _id: number;
      tableName: string;
      createdAt: Date;
      type: string;
      explainerUnavailable?: boolean;
    };

    const activeToday = await this.buttonCallModel
      .find(filter)
      .select({ tableName: 1, createdAt: 1, type: 1, explainerUnavailable: 1 })
      .sort({ type: 1, createdAt: 1 })
      .lean<Row[]>()
      .exec();

    const byType: Record<
      string,
      {
        isQueued: boolean;
        position: number | null;
        waitingCount: number;
        totalActive: number;
        callId?: number;
        explainerUnavailable?: boolean;
      }
    > = {};

    const groups: Record<string, Row[]> = {};
    for (const d of activeToday) {
      (groups[d.type] ??= []).push(d);
    }

    for (const [type, list] of Object.entries(groups)) {
      const index = list.findIndex((d) => d.tableName === tableName);
      const totalActive = list.length;

      byType[type] =
        index === -1
          ? { isQueued: false, position: null, waitingCount: 0, totalActive }
          : {
              isQueued: true,
              position: index + 1,
              waitingCount: index,
              totalActive,
              callId: list[index]!._id,
              // Lets the table pick another game when nobody can explain it.
              ...(list[index]!.explainerUnavailable && {
                explainerUnavailable: true,
              }),
            };
    }

    return byType;
  }

  async remove(id: number) {
    const button_call = await this.buttonCallModel.findById(id);
    if (!button_call) {
      throw new HttpException('Button Call not found', HttpStatus.NOT_FOUND);
    }
    await this.buttonCallModel.findByIdAndDelete(id);
    if (!button_call.finishHour) {
      this.freeAssignee(button_call);
    }
  }

  // A game is being explained at the table: its open GM call (whatever the
  // reason) is answered, closed in the name of whoever explains the game.
  @OnEvent(TABLE_GAMEPLAY_ADDED)
  async closeCallOnGameplayAdded(event: TableGameplayAddedEvent) {
    try {
      const openCall = await this.buttonCallModel.exists({
        tableName: event.tableName,
        location: event.location,
        date: event.date,
        type: ButtonCallTypeEnum.GAMEMASTERCALL,
        finishHour: { $exists: false },
      });
      if (!openCall) {
        return;
      }
      const mentor = event.mentor
        ? await this.userModel.findById(event.mentor)
        : null;
      await this.close(mentor, {
        tableName: event.tableName,
        location: event.location,
        hour: format(new Date(), 'HH:mm:ss'),
        type: ButtonCallTypeEnum.GAMEMASTERCALL,
      });
    } catch (error) {
      this.logger.error(
        'Error closing GM call after gameplay was added',
        error,
      );
    }
  }

  // The game master handling this call is free again: give them a waiting
  // call right away instead of on the next cron run. The usual rules apply,
  // so someone who started explaining a game or a break gets nothing.
  private freeAssignee(call: ButtonCall) {
    if (
      ASSIGNED_CALL_TYPES.includes(call.type as ButtonCallTypeEnum) &&
      call.assignedTo
    ) {
      this.buttonCallAssignmentService.handleStaffAvailabilityChanged();
    }
  }
}
