import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { BreakQueryDto, CreateBreakDto, UpdateBreakDto } from './break.dto';
import { Break } from './break.schema';

@Injectable()
export class BreakService {
  constructor(
    @InjectModel(Break.name) private breakModel: Model<Break>,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  async create(createBreakDto: CreateBreakDto): Promise<Break> {
    try {
      // Check if there's already an active break for the same user, date, and location
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
      this.websocketGateway.emitBreakChanged();
      return breakRecord;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to create break record',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async findAll(query: BreakQueryDto) {
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

    const filter: any = {};

    if (user) filter.user = user;
    if (location) filter.location = location;
    if (date) filter.createdAt = date;

    const rangeFilter: Record<string, any> = {};
    if (after) {
      const start = this.parseLocalDate(after);
      rangeFilter.$gte = start;
    }
    if (before) {
      const end = this.parseLocalDate(before);
      end.setHours(23, 59, 59, 999);
      rangeFilter.$lte = end;
    }
    if (Object.keys(rangeFilter).length) {
      filter.createdAt = rangeFilter;
    }

    const sortObject: Record<string, 1 | -1> = {};
    if (sort) {
      const dir = (typeof asc === 'string' ? Number(asc) : asc) === 1 ? 1 : -1;
      sortObject[sort] = dir;
    } else {
      sortObject.date = -1;
    }
    // Always sort by startHour as secondary sort to ensure proper ordering within the same date
    if (sort !== 'startHour') {
      sortObject.startHour = -1;
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

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

      const totalPages = Math.ceil(totalNumber / limitNum);
      return {
        data,
        totalNumber,
        totalPages,
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
    if (!breakRecord) {
      throw new HttpException('Break record not found', HttpStatus.NOT_FOUND);
    }
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
    try {
      const updatedBreak = await this.breakModel.findByIdAndUpdate(
        id,
        updateBreakDto,
        { new: true },
      );

      if (!updatedBreak) {
        throw new HttpException('Break record not found', HttpStatus.NOT_FOUND);
      }

      this.websocketGateway.emitBreakChanged();
      return updatedBreak;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to update break record',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async delete(id: string): Promise<Break> {
    const deletedBreak = await this.breakModel.findByIdAndDelete(id);
    if (!deletedBreak) {
      throw new HttpException('Break record not found', HttpStatus.NOT_FOUND);
    }

    this.websocketGateway.emitBreakChanged();
    return deletedBreak;
  }
}
