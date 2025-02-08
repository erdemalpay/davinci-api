import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose'; // Add UpdateQuery import
import { User } from '../user/user.schema';
import { CreateShiftDto, ShiftQueryDto } from './shift.dto'; // Add ShiftQueryDto import
import { ShiftGateway } from './shift.gateway';
import { Shift } from './shift.schema';
export class ShiftService {
  constructor(
    @InjectModel(Shift.name) private shiftModel: Model<Shift>,
    private readonly shiftGateway: ShiftGateway,
  ) {}

  async createShift(user: User, createShiftDto: CreateShiftDto) {
    const createdShift = new this.shiftModel(createShiftDto);
    await createdShift.save();
    this.shiftGateway.emitShiftChanged(user, createdShift);
    return createdShift;
  }

  async updateShift(user: User, id: number, updates: UpdateQuery<Shift>) {
    const updatedShift = await this.shiftModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    if (!updatedShift) {
      throw new Error('Shift not found');
    }
    this.shiftGateway.emitShiftChanged(user, updatedShift);
    return updatedShift;
  }

  async removeShift(user: User, id: number) {
    const removedShift = await this.shiftModel.findByIdAndRemove(id);
    if (!removedShift) {
      throw new Error('Shift not found');
    }
    this.shiftGateway.emitShiftChanged(user, removedShift);
    return removedShift;
  }

  async findQueryShifts(query: ShiftQueryDto) {
    const filterQuery: any = {};
    const { after, before, location } = query;
    if (after) {
      filterQuery['day'] = { $gte: new Date(after) };
    }
    if (before) {
      filterQuery['day'] = {
        ...filterQuery['day'],
        $lte: new Date(before),
      };
    }
    if (location) {
      filterQuery['location'] = location;
    }
    try {
      const shifts = await this.shiftModel.find(filterQuery).exec();
      return shifts;
    } catch (error) {
      throw new Error('Failed to fetch shifts');
    }
  }
}
