import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { ActivityType } from '../activity/activity.dto';
import { ActivityService } from '../activity/activity.service';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { CreateShiftDto, ShiftQueryDto, ShiftUserQueryDto } from './shift.dto';
import { Shift, ShiftValues } from './shift.schema';

type ShiftDiff = {
  chefChanges: {
    shift: string;
    previousChefUserId: string;
    chefUserId: string;
  }[];
  middlemanChanges: {
    shift: string;
    previousMiddlemanUserId: string;
    middlemanUserId: string;
  }[];
  hasUserChanges: boolean;
};

@Injectable()
export class ShiftService {
  constructor(
    @InjectModel(Shift.name) private shiftModel: Model<Shift>,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly redisService: RedisService,
    private readonly activityService: ActivityService,
  ) {}

  private diffShifts(
    prevShifts: ShiftValues[],
    newShifts: ShiftValues[],
  ): ShiftDiff {
    const chefChanges: ShiftDiff['chefChanges'] = [];
    const middlemanChanges: ShiftDiff['middlemanChanges'] = [];
    let hasUserChanges = false;

    for (const newVal of newShifts) {
      const prevVal = prevShifts.find((s) => s.shift === newVal.shift);

      const prevUsersArr = prevVal?.user ?? [];
      const newUsersArr = newVal?.user ?? [];

      const prevChef = prevVal?.chefUser ?? '';
      const newChef = newVal?.chefUser ?? '';
      if (newChef !== prevChef) {
        chefChanges.push({
          shift: newVal.shift,
          previousChefUserId: prevChef,
          chefUserId: newChef,
        });
      }

      const prevMiddleman = prevVal?.middlemanUser ?? '';
      const newMiddleman = newVal?.middlemanUser ?? '';
      if (newMiddleman !== prevMiddleman) {
        middlemanChanges.push({
          shift: newVal.shift,
          previousMiddlemanUserId: prevMiddleman,
          middlemanUserId: newMiddleman,
        });
      }

      const prevUsersSorted = prevUsersArr.slice().sort((a, b) => a.localeCompare(b)).join(',');
      const newUsersSorted = newUsersArr.slice().sort((a, b) => a.localeCompare(b)).join(',');
      if (prevUsersSorted !== newUsersSorted) hasUserChanges = true;
    }

    return { chefChanges, middlemanChanges, hasUserChanges };
  }

  async createShift(user: User, createShiftDto: CreateShiftDto) {
    const createdShift = new this.shiftModel(createShiftDto);
    await createdShift.save();
    this.websocketGateway.emitShiftChanged();
    try {
      await this.activityService.addActivity(user, ActivityType.CREATE_SHIFT, {
        day: createdShift.day,
        location: createdShift.location,
        shifts: createdShift.shifts,
      });
    } catch (e) {
      console.error('Failed to log create shift activity', e);
    }
    return createdShift;
  }

  async updateShift(user: User, id: number, updates: UpdateQuery<Shift>) {
    const previousShift = await this.shiftModel.findById(id).exec();
    const updatedShift = await this.shiftModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    if (!updatedShift) {
      throw new HttpException('Shift not found', HttpStatus.NOT_FOUND);
    }
    this.websocketGateway.emitShiftChanged();

    const prevShifts: ShiftValues[] = previousShift?.shifts ?? [];
    const newShifts: ShiftValues[] = (updates.shifts ?? []) as ShiftValues[];
    const { chefChanges, middlemanChanges, hasUserChanges } = this.diffShifts(
      prevShifts,
      newShifts,
    );

    const base = { day: updatedShift.day, location: updatedShift.location };

    try {
      await Promise.all([
        ...chefChanges.map((c) =>
          this.activityService.addActivity(user, ActivityType.ASSIGN_CHEF, {
            ...base,
            shift: c.shift,
            previousChefUserId: c.previousChefUserId,
            chefUserId: c.chefUserId,
          }),
        ),
        ...middlemanChanges.map((c) =>
          this.activityService.addActivity(
            user,
            ActivityType.ASSIGN_MIDDLEMAN,
            {
              ...base,
              shift: c.shift,
              previousMiddlemanUserId: c.previousMiddlemanUserId,
              middlemanUserId: c.middlemanUserId,
            },
          ),
        ),
        hasUserChanges
          ? this.activityService.addActivity(user, ActivityType.UPDATE_SHIFT, {
              ...base,
              previousShifts: prevShifts,
              updatedShifts: updatedShift.shifts,
            })
          : Promise.resolve(),
      ]);
    } catch (e) {
      console.error('Failed to log shift update activity', e);
    }

    return updatedShift;
  }

  async removeShift(user: User, id: number) {
    const removedShift = await this.shiftModel.findByIdAndRemove(id);
    if (!removedShift) {
      throw new HttpException('Shift not found', HttpStatus.NOT_FOUND);
    }
    this.websocketGateway.emitShiftChanged();
    try {
      await this.activityService.addActivity(user, ActivityType.DELETE_SHIFT, {
        day: removedShift.day,
        location: removedShift.location,
      });
    } catch (e) {
      console.error('Failed to log delete shift activity', e);
    }
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

    let shiftsData: Shift[] = [];
    const daysNeedingFetch: string[] = [];
    let cachedShiftsMap: Record<string, Shift[]> | null = null;

    try {
      cachedShiftsMap = await this.redisService.get(RedisKeys.Shifts);
      if (cachedShiftsMap) {
        for (const day of daysInRange) {
          if (cachedShiftsMap[day]) {
            shiftsData.push(...cachedShiftsMap[day]);
          } else {
            daysNeedingFetch.push(day);
          }
        }
      } else {
        daysNeedingFetch.push(...daysInRange);
      }
    } catch (error) {
      console.error('Failed to retrieve shifts from Redis:', error);
      daysNeedingFetch.push(...daysInRange);
    }

    if (daysNeedingFetch.length > 0) {
      try {
        const filterQuery: any = {
          day: { $in: daysNeedingFetch },
        };

        const dbShifts = await this.shiftModel.find(filterQuery).exec();
        shiftsData.push(...dbShifts);

        if (dbShifts.length > 0 || daysNeedingFetch.length > 0) {
          try {
            const existingCache = cachedShiftsMap || {};

            for (const shift of dbShifts) {
              if (!existingCache[shift.day]) {
                existingCache[shift.day] = [];
              }
              existingCache[shift.day].push(shift);
            }

            for (const day of daysNeedingFetch) {
              if (!existingCache[day]) {
                existingCache[day] = [];
              }
            }

            await this.redisService.set(RedisKeys.Shifts, existingCache);
          } catch (error) {
            console.error('Failed to cache shifts in Redis:', error);
          }
        }
      } catch (error) {
        throw new HttpException(
          'Failed to fetch shifts',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
    if (location) {
      shiftsData = shiftsData.filter(
        (shift) => Number(shift.location) === Number(location),
      );
    }
    const shiftsMap = new Map<string, any[]>();
    for (const shift of shiftsData) {
      const existing = shiftsMap.get(shift.day) || [];
      existing.push(shift);
      shiftsMap.set(shift.day, existing);
    }
    const result = daysInRange.flatMap((day) => {
      const dayShifts = shiftsMap.get(day);
      if (dayShifts && dayShifts.length > 0) {
        return dayShifts;
      }
      return [{ day, shifts: [] }];
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
        const merged = targetShift?.shifts?.map((existing) => {
          const updated = filteredShifts?.find(
            (f) => f.shift === existing.shift,
          );
          if (!updated) return existing;
          const users = Array.from(
            new Set([...(existing.user || []), ...updated.user]),
          );
          return {
            ...existing,
            user: users,
          };
        });
        targetShift.shifts = merged;
        await targetShift.save();
        this.websocketGateway.emitShiftChanged();
        return targetShift;
      } else {
        const { _id, ...shiftData } = sourceShift.toObject();
        shiftData.day = selectedDay;
        shiftData.location = location;
        shiftData.shifts = filteredShifts;
        const newShift = new this.shiftModel(shiftData);
        await newShift.save();
        this.websocketGateway.emitShiftChanged();
        return newShift;
      }
    } catch (error) {
      console.error('Error in copyShift:', error);
      throw new HttpException(
        'Failed to copy shift',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async copyShiftInterval(
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
        const merged = targetShift.shifts.map((existing) => {
          const updated = filteredShifts.find(
            (f) => f.shift === existing.shift,
          );
          if (!updated) return existing;

          const users = Array.from(
            new Set([...(existing.user || []), ...updated.user]),
          );
          return {
            ...existing,
            user: users,
          };
        });
        targetShift.shifts = merged;
        await targetShift.save();
        this.websocketGateway.emitShiftChanged();
        results.push(targetShift);
      } else {
        const { _id, ...shiftData } = sourceShift.toObject();
        shiftData.day = targetDay;
        shiftData.location = location;
        shiftData.shifts = filteredShifts;
        const newShift = new this.shiftModel(shiftData);
        await newShift.save();
        this.websocketGateway.emitShiftChanged();
        results.push(newShift);
      }
      offset++;
    }
    return results;
  }
  async addShift(
    day: string,
    shift: string,
    location: number,
    userId: string,
    shiftEndHour?: string,
  ) {
    const updated = await this.shiftModel
      .findOneAndUpdate(
        { day, location, 'shifts.shift': shift },
        {
          $addToSet: { 'shifts.$.user': userId },
          'shifts.$.shiftEndHour': shiftEndHour,
        },
        { new: true },
      )
      .exec();
    if (!updated) {
      const result = await this.shiftModel
        .findOneAndUpdate(
          { day, location },
          {
            $push: {
              shifts: { shift, user: [userId], chefUser: '', shiftEndHour },
            },
          },
          { upsert: true, new: true },
        )
        .exec();
      this.websocketGateway.emitShiftChanged();
      return result;
    }
    this.websocketGateway.emitShiftChanged();
    return updated;
  }

  async findUsersFutureShifts(after: string) {
    const filterQuery: any = {
      day: { $gte: after },
    };

    return this.shiftModel.find(filterQuery).sort({ day: 1 }).exec();
  }
}
