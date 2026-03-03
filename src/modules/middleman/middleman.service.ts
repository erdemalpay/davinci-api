import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
import { UserService } from '../user/user.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { extractRefId } from 'src/utils/tsUtils';
import { computeDurationMinutes } from 'src/utils/timeUtils';
import {
  buildPaginationParams,
  buildSortObject,
  totalPages,
} from 'src/utils/queryUtils';
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
    try {
      // Only 1 active middleman per location at a time
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

      try {
        const user = await this.userService.findById(createMiddlemanDto.user);
        if (user) {
          await this.activityService.addActivity(
            user,
            ActivityType.START_MIDDLEMAN,
            (record.toObject ? record.toObject() : record) as Middleman,
          );
        }
      } catch (activityError) {
        console.error('Failed to add start middleman activity:', activityError);
      }

      this.websocketGateway.emitMiddlemanChanged();
      return record;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to create middleman record',
        HttpStatus.BAD_REQUEST,
      );
    }
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
      (record: { startHour?: string; finishHour?: string }) => {
        const duration = computeDurationMinutes(
          record.startHour ?? '',
          record.finishHour ?? '',
        );
        return { ...record, duration };
      },
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
    if (!record) {
      throw new HttpException(
        'Middleman record not found',
        HttpStatus.NOT_FOUND,
      );
    }
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
    try {
      const updated = await this.middlemanModel.findByIdAndUpdate(
        id,
        updateDto,
        { new: true },
      );

      if (!updated) {
        throw new HttpException(
          'Middleman record not found',
          HttpStatus.NOT_FOUND,
        );
      }

      if (updateDto.finishHour) {
        try {
          const userId = String(extractRefId(updated.user));
          const user = await this.userService.findById(userId);
          if (user) {
            await this.activityService.addActivity(
              user,
              ActivityType.FINISH_MIDDLEMAN,
              (updated.toObject ? updated.toObject() : updated) as Middleman,
            );
          }
        } catch (activityError) {
          console.error(
            'Failed to add finish middleman activity:',
            activityError,
          );
        }
      }

      this.websocketGateway.emitMiddlemanChanged();
      return updated;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to update middleman record',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async delete(id: string): Promise<Middleman> {
    const deleted = await this.middlemanModel.findByIdAndDelete(id);
    if (!deleted) {
      throw new HttpException(
        'Middleman record not found',
        HttpStatus.NOT_FOUND,
      );
    }
    this.websocketGateway.emitMiddlemanChanged();
    return deleted;
  }
}
