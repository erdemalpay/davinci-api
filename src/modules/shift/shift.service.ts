import { HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { User } from '../user/user.schema';
import { CreateShiftDto, ShiftQueryDto, ShiftUserQueryDto } from './shift.dto';
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

  async findUserShifts(query: ShiftUserQueryDto) {
    const { after, before, user: userId } = query;
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
    return this.shiftModel.find(filterQuery).exec();
  }

  async copyShift(
    user: User,
    copiedDay: string,
    selectedDay: string,
    location: number,
    selectedUsers?: string[],
  ) {
    try {
      const sourceShift = await this.shiftModel
        .findOne({ day: copiedDay, location: location })
        .exec();
      if (!sourceShift) {
        throw new HttpException('Source shift not found', HttpStatus.NOT_FOUND);
      }
      let filteredShifts = sourceShift.shifts;
      if (selectedUsers && selectedUsers.length > 0) {
        filteredShifts = sourceShift?.shifts?.map((shift) => {
          return {
            ...shift,
            user: shift?.user?.filter((u) => selectedUsers.includes(u)) ?? [],
          };
        });
      }
      let targetShift = await this.shiftModel
        .findOne({ day: selectedDay, location: location })
        .exec();
      if (targetShift) {
        targetShift.shifts = filteredShifts;
        targetShift = await targetShift.save();
        this.shiftGateway.emitShiftChanged(user, targetShift);
        return targetShift;
      } else {
        const { _id, ...shiftData } = sourceShift.toObject();
        shiftData.day = selectedDay;
        shiftData.location = location;
        shiftData.shifts = filteredShifts;
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

  async copyShiftInterval(
    user: User,
    startCopiedDay: string,
    endCopiedDay: string,
    selectedDay: string,
    location: number,
    selectedUsers?: string[],
  ) {
    const startDate = new Date(startCopiedDay);
    const endDate = new Date(endCopiedDay);
    if (endDate < startDate) {
      throw new HttpException('Invalid interval', HttpStatus.BAD_REQUEST);
    }
    const results = [];
    let offset = 0;
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      const sourceDay = d.toISOString().split('T')[0];
      const targetDate = new Date(selectedDay);
      targetDate.setDate(targetDate.getDate() + offset);
      const targetDay = targetDate.toISOString().split('T')[0];

      const sourceShift = await this.shiftModel
        .findOne({ day: sourceDay, location: location })
        .exec();
      if (!sourceShift) {
        continue;
      }
      let targetShift = await this.shiftModel
        .findOne({ day: targetDay, location: location })
        .exec();
      let filteredShifts = sourceShift.shifts;
      if (selectedUsers && selectedUsers.length > 0) {
        filteredShifts = sourceShift?.shifts?.map((shift) => {
          return {
            ...shift,
            user: shift?.user?.filter((u) => selectedUsers.includes(u)) ?? [],
          };
        });
      }
      if (targetShift) {
        targetShift.shifts = filteredShifts;
        targetShift = await targetShift.save();
        this.shiftGateway.emitShiftChanged(user, targetShift);
        results.push(targetShift);
      } else {
        const { _id, ...shiftData } = sourceShift.toObject();
        shiftData.day = targetDay;
        shiftData.location = location;
        shiftData.shifts = filteredShifts;
        const newShift = new this.shiftModel(shiftData);
        await newShift.save();
        this.shiftGateway.emitShiftChanged(user, newShift);
        results.push(newShift);
      }
      offset++;
    }
    return results;
  }
  async addShift(day: string, shift: string, location: number, userId: string) {
    const updated = await this.shiftModel
      .findOneAndUpdate(
        { day, location, 'shifts.shift': shift },
        { $addToSet: { 'shifts.$.user': userId } },
        { new: true },
      )
      .exec();

    if (!updated) {
      const result = await this.shiftModel
        .findOneAndUpdate(
          { day, location },
          { $push: { shifts: { shift, user: [userId], chefUser: '' } } },
          { upsert: true, new: true },
        )
        .exec();
      this.shiftGateway.emitShiftChanged();
      return result;
    }

    this.shiftGateway.emitShiftChanged();
    return updated;
  }
}
