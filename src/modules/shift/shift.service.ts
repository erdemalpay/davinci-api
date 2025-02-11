import { HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { User } from '../user/user.schema';
import { CreateShiftDto, ShiftQueryDto } from './shift.dto';
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
    const { after, before, location } = query;
    const startDate = new Date(after);
    const endDate = new Date(before);
    const daysInRange: string[] = [];
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      daysInRange.push(d.toISOString().split('T')[0]);
    }
    const filterQuery: any = {};
    if (after) {
      filterQuery['day'] = { $gte: after };
    }
    if (before) {
      filterQuery['day'] = {
        ...filterQuery['day'],
        $lte: before,
      };
    }
    if (location) {
      filterQuery['location'] = location;
    }
    let shiftsData;
    try {
      shiftsData = await this.shiftModel.find(filterQuery).exec();
    } catch (error) {
      throw new Error('Failed to fetch shifts');
    }
    const shiftsMap = new Map<string, any>();
    for (const shift of shiftsData) {
      shiftsMap.set(shift.day, shift);
    }
    const result = daysInRange.map((day) => {
      if (shiftsMap.has(day)) {
        return shiftsMap.get(day);
      } else {
        return { day, shifts: [] };
      }
    });

    return result;
  }

  async copyShift(user: User, copiedDay: string, selectedDay: string) {
    try {
      const sourceShift = await this.shiftModel
        .findOne({ day: copiedDay })
        .exec();
      if (!sourceShift) {
        throw new HttpException('Source shift not found', HttpStatus.NOT_FOUND);
      }
      let targetShift = await this.shiftModel
        .findOne({ day: selectedDay })
        .exec();
      if (targetShift) {
        targetShift.shifts = sourceShift.shifts;
        targetShift = await targetShift.save();
        this.shiftGateway.emitShiftChanged(user, targetShift);
        return targetShift;
      } else {
        const { _id, ...shiftData } = sourceShift.toObject();
        shiftData.day = selectedDay;
        const newShift = new this.shiftModel(shiftData);
        await newShift.save();
        this.shiftGateway.emitShiftChanged(user, newShift);
        return newShift;
      }
    } catch (error) {
      console.error('Error in copyShift:', error);
      throw error;
    }
  }
}
