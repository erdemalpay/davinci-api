import { format } from 'date-fns';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  BUSY_STATE_STARTED_ON_DECLINE,
  BusyStateStartedEvent,
  STAFF_AVAILABILITY_CHANGED,
} from '../../lib/events';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { dateRanges } from 'src/utils/dateRanges';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
import { ASSIGNED_CALL_TYPES } from '../buttonCall/dto/create-buttonCall.dto';
import { ButtonCall } from '../buttonCall/schemas/buttonCall.schema';
import { LocationService } from '../location/location.service';
import { NotificationEventType } from '../notification/notification.dto';
import { NotificationService } from '../notification/notification.service';
import { UserService } from '../user/user.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { computeDurationMinutes } from 'src/utils/timeUtils';
import {
  buildPaginationParams,
  buildSortObject,
  totalPages,
} from 'src/utils/queryUtils';
import {
  assertFound,
  toPlainObject,
  tryAddActivity,
  wrapHttpException,
} from 'src/utils/serviceUtils';
import {
  BreakQueryDto,
  BreakTypeEnum,
  CreateBreakDto,
  UpdateBreakDto,
} from './break.dto';
import { Break } from './break.schema';
import { isConcurrentBreak } from './break.warning';
import { Shift } from '../shift/shift.schema';
import { VisitStatus } from '../visit/visit.dto';
import { Visit } from '../visit/visit.schema';
import { GameplayTime } from '../gameplaytime/gameplaytime.schema';
import { Middleman } from '../middleman/middleman.schema';

// Summary keys for the non-break states.
export const STATE_EXPLAINING = 'EXPLAINING';
export const STATE_MIDDLEMAN = 'MIDDLEMAN';

@Injectable()
export class BreakService {
  private readonly logger = new Logger(BreakService.name);

  constructor(
    @InjectModel(Break.name) private breakModel: Model<Break>,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly locationService: LocationService,
    private readonly userService: UserService,
    private readonly activityService: ActivityService,
    private readonly notificationService: NotificationService,
    private readonly eventEmitter: EventEmitter2,
    @InjectModel(ButtonCall.name)
    private readonly buttonCallModel: Model<ButtonCall>,
    @InjectModel(GameplayTime.name)
    private readonly gameplayTimeModel: Model<GameplayTime>,
    @InjectModel(Middleman.name)
    private readonly middlemanModel: Model<Middleman>,
    @InjectModel(Visit.name) private readonly visitModel: Model<Visit>,
    @InjectModel(Shift.name) private readonly shiftModel: Model<Shift>,
  ) {}

  // Whether a new break of `user` leaves the cafe short of staff; see
  // isConcurrentBreak.
  private async leavesCafeShort(user: string, location: number, date: string) {
    const [shift, breaks, visits] = await Promise.all([
      this.shiftModel.findOne({ day: date, location }).select('shifts').lean(),
      this.breakModel
        .find({
          location,
          date,
          user: { $ne: user },
          finishHour: { $exists: false },
          type: { $in: [BreakTypeEnum.BREAK, null] },
        })
        .select('user')
        .lean(),
      this.visitModel
        .find({
          location,
          date,
          finishHour: { $exists: false },
          status: { $ne: VisitStatus.WRONG_ENTRY },
        })
        .select('user')
        .lean(),
    ]);
    const outsideOperation = new Set(
      (shift?.shifts ?? []).flatMap((s) => s.outsideOperationUsers ?? []),
    );
    const counted = (records: { user: unknown }[]) =>
      new Set(
        records
          .map((record) => String(record.user))
          .filter((id) => !outsideOperation.has(id)),
      ).size;
    return isConcurrentBreak(counted(breaks), counted(visits));
  }

  // Minutes each person spent in each state on a day: every busy state
  // (break, recommending a game, ...), explaining games and middleman.
  // Records still open count until now (or the end of a past day).
  async getStateSummary(date: string, location?: number) {
    const filter = { date, ...(location && { location: Number(location) }) };
    const [breaks, gameplayTimes, middlemen] = await Promise.all([
      this.breakModel
        .find(filter)
        .select('user type startHour finishHour')
        .lean(),
      this.gameplayTimeModel
        .find(filter)
        .select('user startHour finishHour')
        .lean(),
      this.middlemanModel
        .find(filter)
        .select('user startHour finishHour')
        .lean(),
    ]);
    const isToday = date === format(new Date(), 'yyyy-MM-dd');
    const openUntil = isToday ? format(new Date(), 'HH:mm') : '23:59';
    const minutesByUser = new Map<string, Record<string, number>>();
    const add = (
      user: unknown,
      state: string,
      record: { startHour?: string; finishHour?: string },
    ) => {
      if (!record.startHour) return;
      const userId = String(user);
      const minutes = computeDurationMinutes(
        record.startHour.slice(0, 5),
        (record.finishHour ?? openUntil).slice(0, 5),
      );
      const states = minutesByUser.get(userId) ?? {};
      states[state] = (states[state] ?? 0) + minutes;
      minutesByUser.set(userId, states);
    };
    breaks.forEach((b) => add(b.user, b.type ?? BreakTypeEnum.BREAK, b));
    gameplayTimes.forEach((g) => add(g.user, STATE_EXPLAINING, g));
    middlemen.forEach((m) => add(m.user, STATE_MIDDLEMAN, m));
    return [...minutesByUser.entries()].map(([user, minutes]) => ({
      user,
      minutes,
      totalMinutes: Object.values(minutes).reduce((a, b) => a + b, 0),
    }));
  }

  async create(createBreakDto: CreateBreakDto): Promise<Break> {
    return wrapHttpException(async () => {
      const assignedCall = await this.buttonCallModel.exists({
        assignedTo: createBreakDto.user,
        type: { $in: ASSIGNED_CALL_TYPES },
        date: createBreakDto.date,
        finishHour: { $exists: false },
      });
      if (assignedCall) {
        throw new HttpException(
          'You have an assigned call. Close or decline it before becoming busy.',
          HttpStatus.CONFLICT,
        );
      }
      const isBreak =
        !createBreakDto.type || createBreakDto.type === BreakTypeEnum.BREAK;

      const existingActiveBreak = await this.breakModel.findOne({
        user: createBreakDto.user,
        date: createBreakDto.date,
        location: createBreakDto.location,
        finishHour: { $exists: false },
      });

      if (existingActiveBreak) {
        throw new HttpException(
          'User already has an active break for this date and location',
          HttpStatus.CONFLICT,
        );
      }

      // Only real breaks count for the concurrent break warning.
      const isCafeShort =
        isBreak &&
        (await this.leavesCafeShort(
          createBreakDto.user,
          createBreakDto.location,
          createBreakDto.date,
        ));

      const breakRecord = await this.breakModel.create({
        ...createBreakDto,
        type: createBreakDto.type ?? BreakTypeEnum.BREAK,
        ...(createBreakDto.type === BreakTypeEnum.OTHER && {
          note: createBreakDto.note?.trim(),
        }),
      });
      await tryAddActivity(
        this.activityService,
        this.userService,
        createBreakDto.user,
        ActivityType.START_BREAK,
        toPlainObject(breakRecord),
        'start break',
      );
      this.websocketGateway.emitBreakChanged();
      this.eventEmitter.emit(STAFF_AVAILABILITY_CHANGED);

      if (isCafeShort) {
        await this.notifyConcurrentBreak(
          createBreakDto.user,
          createBreakDto.location,
        );
      }

      return breakRecord;
    }, 'Failed to create break record');
  }

  // Someone declined a call because they're going on a break / are busy:
  // the record is already created; log it and warn like any other break.
  @OnEvent(BUSY_STATE_STARTED_ON_DECLINE)
  async handleBusyStateStartedOnDecline({
    breakRecord,
  }: BusyStateStartedEvent) {
    try {
      await tryAddActivity(
        this.activityService,
        this.userService,
        breakRecord.user,
        ActivityType.START_BREAK,
        breakRecord,
        'start break',
      );
      if (
        breakRecord.type === BreakTypeEnum.BREAK &&
        (await this.leavesCafeShort(
          breakRecord.user,
          breakRecord.location,
          breakRecord.date,
        ))
      ) {
        await this.notifyConcurrentBreak(
          breakRecord.user,
          breakRecord.location,
        );
      }
    } catch (error) {
      this.logger.error(
        'Failed to handle busy state started on decline',
        error,
      );
    }
  }

  private async notifyConcurrentBreak(user: string, location: number) {
    const notificationEvents =
      await this.notificationService.findAllEventNotifications();
    const concurrentBreakEvent = notificationEvents.find(
      (n) => n.event === NotificationEventType.CONCURRENTBREAK,
    );
    if (!concurrentBreakEvent) {
      return;
    }
    const [breakUser, breakLocation] = await Promise.all([
      this.userService.findById(user),
      this.locationService.findLocationById(location),
    ]);
    await this.notificationService.createNotification({
      type: concurrentBreakEvent.type,
      createdBy: concurrentBreakEvent.createdBy,
      selectedUsers: concurrentBreakEvent.selectedUsers,
      selectedRoles: concurrentBreakEvent.selectedRoles,
      selectedLocations: concurrentBreakEvent.selectedLocations,
      seenBy: [],
      event: NotificationEventType.CONCURRENTBREAK,
      message: {
        key: 'ConcurrentBreakWarning',
        params: {
          userName: breakUser?.name ?? user,
          locationName: breakLocation?.name ?? String(location),
        },
      },
    });
  }

  async findAll(query: BreakQueryDto) {
    const {
      user,
      location,
      search,
      date,
      after,
      before,
      page = 1,
      limit = 10,
      sort = 'createdAt',
      asc = -1,
    } = query;
    const filter: any = {};

    if (user) filter.user = user;
    if (location) filter.location = location;

    if (date && dateRanges[date]) {
      const { after: dAfter, before: dBefore } = dateRanges[date]();
      const start = this.parseLocalDate(dAfter);
      const end = this.parseLocalDate(dBefore);
      end.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: start, $lte: end };
    } else {
      const rangeFilter: Record<string, any> = {};
      if (after) rangeFilter.$gte = this.parseLocalDate(after);
      if (before) {
        const end = this.parseLocalDate(before);
        end.setHours(23, 59, 59, 999);
        rangeFilter.$lte = end;
      }
      if (Object.keys(rangeFilter).length) filter.createdAt = rangeFilter;
    }

    const sortObject = buildSortObject(sort, asc);
    const { pageNum, limitNum, skip } = buildPaginationParams(page, limit);

    if (search && String(search).trim().length > 0) {
      const rx = new RegExp(String(search).trim(), 'i');
      const numeric = Number(search);
      const isNumeric = !Number.isNaN(numeric);
      const [searchedLocationIds, searchedUserIds] = await Promise.all([
        this.locationService.searchLocationIds(search),
        this.userService.searchUserIds(search),
      ]);
      const orConds: any[] = [
        { date: { $regex: rx } },
        { startHour: { $regex: rx } },
        { finishHour: { $regex: rx } },
        ...(searchedUserIds.length ? [{ user: { $in: searchedUserIds } }] : []),
        ...(searchedLocationIds.length
          ? [{ location: { $in: searchedLocationIds } }]
          : []),
      ];
      if (isNumeric) orConds.push({ _id: numeric as any });
      if (orConds.length) filter.$or = orConds;
    }

    try {
      const [data, totalNumber] = await Promise.all([
        this.breakModel
          .find(filter)
          .sort(sortObject)
          .skip(skip)
          .limit(limitNum)
          .lean()
          .exec(),
        this.breakModel.countDocuments(filter),
      ]);

      const dailyDurationMap = new Map<string, number>();
      const dataWithDuration = data.map((breakRecord: any) => {
        const duration = computeDurationMinutes(
          breakRecord.startHour ?? '',
          breakRecord.finishHour ?? '',
        );
        if (duration > 0) {
          const key = `${breakRecord.user}-${breakRecord.date}`;
          dailyDurationMap.set(key, (dailyDurationMap.get(key) || 0) + duration);
        }
        return { ...breakRecord, duration };
      });

      const dataWithDailyDuration = dataWithDuration.map((breakRecord) => ({
        ...breakRecord,
        dailyDuration:
          dailyDurationMap.get(`${breakRecord.user}-${breakRecord.date}`) || 0,
      }));

      return {
        data: dataWithDailyDuration,
        totalNumber,
        totalPages: totalPages(totalNumber, limitNum),
        page: pageNum,
        limit: limitNum,
      };
    } catch (error) {
      throw new HttpException(
        'Failed to fetch break records',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private parseLocalDate(dateString: string): Date {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new HttpException('Invalid date format', HttpStatus.BAD_REQUEST);
    }
    return date;
  }

  async findById(id: string): Promise<Break> {
    const breakRecord = await this.breakModel.findById(id);
    assertFound(breakRecord, 'Break record not found');
    return breakRecord;
  }

  async findByLocation(location: number): Promise<Break[]> {
    return this.breakModel
      .find({ location, finishHour: { $exists: false } })
      .sort({ date: -1 })
      .exec();
  }

  async findByDate(date: string): Promise<Break[]> {
    return this.breakModel
      .find({ date, finishHour: { $exists: false } })
      .sort({ startHour: 1 })
      .exec();
  }

  async update(id: string, updateBreakDto: UpdateBreakDto): Promise<Break> {
    return wrapHttpException(async () => {
      const updatedBreak = await this.breakModel.findByIdAndUpdate(
        id,
        updateBreakDto,
        { new: true },
      );
      assertFound(updatedBreak, 'Break record not found');

      if (updateBreakDto.finishHour) {
        await tryAddActivity(
          this.activityService,
          this.userService,
          updatedBreak.user,
          ActivityType.FINISH_BREAK,
          toPlainObject(updatedBreak),
          'finish break',
        );
      }

      this.websocketGateway.emitBreakChanged();
      this.eventEmitter.emit(STAFF_AVAILABILITY_CHANGED);
      return updatedBreak;
    }, 'Failed to update break record');
  }

  async delete(id: string): Promise<Break> {
    const deletedBreak = await this.breakModel.findByIdAndDelete(id);
    assertFound(deletedBreak, 'Break record not found');
    this.websocketGateway.emitBreakChanged();
    this.eventEmitter.emit(STAFF_AVAILABILITY_CHANGED);
    return deletedBreak;
  }
}
