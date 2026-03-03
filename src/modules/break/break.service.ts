import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { dateRanges } from 'src/utils/dateRanges';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
import { LocationService } from '../location/location.service';
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
import { BreakQueryDto, CreateBreakDto, UpdateBreakDto } from './break.dto';
import { Break } from './break.schema';

@Injectable()
export class BreakService {
  constructor(
    @InjectModel(Break.name) private breakModel: Model<Break>,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly locationService: LocationService,
    private readonly userService: UserService,
    private readonly activityService: ActivityService,
  ) {}

  async create(createBreakDto: CreateBreakDto): Promise<Break> {
    return wrapHttpException(async () => {
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

      const breakRecord = await this.breakModel.create(createBreakDto);
      await tryAddActivity(
        this.activityService,
        this.userService,
        createBreakDto.user,
        ActivityType.START_BREAK,
        toPlainObject(breakRecord),
        'start break',
      );
      this.websocketGateway.emitBreakChanged();
      return breakRecord;
    }, 'Failed to create break record');
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
      return updatedBreak;
    }, 'Failed to update break record');
  }

  async delete(id: string): Promise<Break> {
    const deletedBreak = await this.breakModel.findByIdAndDelete(id);
    assertFound(deletedBreak, 'Break record not found');
    this.websocketGateway.emitBreakChanged();
    return deletedBreak;
  }
}
