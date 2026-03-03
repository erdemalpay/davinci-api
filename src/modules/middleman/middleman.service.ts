import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
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
  CreateMiddlemanDto,
  MiddlemanQueryDto,
  UpdateMiddlemanDto,
} from './middleman.dto';
import { Middleman } from './middleman.schema';

@Injectable()
export class MiddlemanService {
  constructor(
    @InjectModel(Middleman.name) private middlemanModel: Model<Middleman>,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly userService: UserService,
    private readonly activityService: ActivityService,
  ) {}

  async create(createMiddlemanDto: CreateMiddlemanDto): Promise<Middleman> {
    return wrapHttpException(async () => {
      const existingActive = await this.middlemanModel.findOne({
        location: createMiddlemanDto.location,
        finishHour: { $exists: false },
      });

      if (existingActive) {
        throw new HttpException(
          'There is already an active middleman for this location',
          HttpStatus.CONFLICT,
        );
      }

      const record = await this.middlemanModel.create(createMiddlemanDto);
      await tryAddActivity(
        this.activityService,
        this.userService,
        createMiddlemanDto.user,
        ActivityType.START_MIDDLEMAN,
        toPlainObject(record),
        'start middleman',
      );
      this.websocketGateway.emitMiddlemanChanged();
      return record;
    }, 'Failed to create middleman record');
  }

  async findAll(query: MiddlemanQueryDto) {
    const {
      user,
      location,
      date,
      after,
      before,
      page = 1,
      limit = 10,
      sort = 'createdAt',
      asc = -1,
    } = query;

    const filter: FilterQuery<Middleman> = {};
    if (user) filter.user = user;
    if (location) filter.location = location;

    const rangeFilter: { $gte?: Date; $lte?: Date } = {};
    if (after) rangeFilter.$gte = new Date(after);
    if (before) {
      const end = new Date(before);
      end.setHours(23, 59, 59, 999);
      rangeFilter.$lte = end;
    }
    if (Object.keys(rangeFilter).length) filter.createdAt = rangeFilter;

    if (date) filter.date = date;

    const { pageNum, limitNum, skip } = buildPaginationParams(page, limit);
    const sortObject = buildSortObject(sort, asc);

    const [data, totalNumber] = await Promise.all([
      this.middlemanModel
        .find(filter)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .lean()
        .exec(),
      this.middlemanModel.countDocuments(filter),
    ]);

    const dataWithDuration = data.map(
      (record: { startHour?: string; finishHour?: string }) => ({
        ...record,
        duration: computeDurationMinutes(
          record.startHour ?? '',
          record.finishHour ?? '',
        ),
      }),
    );

    return {
      data: dataWithDuration,
      totalNumber,
      totalPages: totalPages(totalNumber, limitNum),
      page: pageNum,
      limit: limitNum,
    };
  }

  async findById(id: string): Promise<Middleman> {
    const record = await this.middlemanModel.findById(id);
    assertFound(record, 'Middleman record not found');
    return record;
  }

  async findByLocation(location: number): Promise<Middleman[]> {
    return this.middlemanModel
      .find({ location, finishHour: { $exists: false } })
      .sort({ date: -1 })
      .exec();
  }

  async findByDate(date: string): Promise<Middleman[]> {
    return this.middlemanModel.find({ date }).sort({ startHour: 1 }).exec();
  }

  async update(id: string, updateDto: UpdateMiddlemanDto): Promise<Middleman> {
    return wrapHttpException(async () => {
      const updated = await this.middlemanModel.findByIdAndUpdate(
        id,
        updateDto,
        { new: true },
      );
      assertFound(updated, 'Middleman record not found');

      if (updateDto.finishHour) {
        await tryAddActivity(
          this.activityService,
          this.userService,
          updated.user,
          ActivityType.FINISH_MIDDLEMAN,
          toPlainObject(updated),
          'finish middleman',
        );
      }

      this.websocketGateway.emitMiddlemanChanged();
      return updated;
    }, 'Failed to update middleman record');
  }

  async delete(id: string): Promise<Middleman> {
    const deleted = await this.middlemanModel.findByIdAndDelete(id);
    assertFound(deleted, 'Middleman record not found');
    this.websocketGateway.emitMiddlemanChanged();
    return deleted;
  }
}
