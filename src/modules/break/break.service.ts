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

  async findAll(query: BreakQueryDto): Promise<Break[]> {
    const {
      user,
      location,
      date,
      after,
      before,
      page = 1,
      limit = 10,
      sort = 'date',
      asc = -1,
    } = query;

    const filter: any = {};

    if (user) filter.user = user;
    if (location) filter.location = location;
    if (date) filter.date = date;
    if (after || before) {
      filter.date = {};
      if (after) filter.date.$gte = after;
      if (before) filter.date.$lte = before;
    }

    const skip = (page - 1) * limit;
    const sortObject: Record<string, 1 | -1> = {};
    if (sort) {
      const dirRaw =
        typeof asc === 'string' ? Number(asc) : (asc as number | undefined);
      const dir: 1 | -1 = dirRaw === 1 ? 1 : -1;
      sortObject[sort] = dir;
    } else {
      sortObject.date = -1;
    }

    return this.breakModel
      .find(filter)
      .sort(sortObject)
      .skip(skip)
      .limit(limit)
      .exec();
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
