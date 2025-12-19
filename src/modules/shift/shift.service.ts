import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { CreateShiftDto, ShiftQueryDto, ShiftUserQueryDto } from './shift.dto';
import { Shift } from './shift.schema';

@Injectable()
export class ShiftService {
  private readonly logger = new Logger(ShiftService.name);

  constructor(
    @InjectModel(Shift.name) private shiftModel: Model<Shift>,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly redisService: RedisService,
  ) {}

  async createShift(createShiftDto: CreateShiftDto) {
    const createdShift = new this.shiftModel(createShiftDto);
    await createdShift.save();
    this.websocketGateway.emitShiftChanged();
    return createdShift;
  }

  async updateShift(id: number, updates: UpdateQuery<Shift>) {
    const updatedShift = await this.shiftModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    if (!updatedShift) {
      throw new HttpException('Shift not found', HttpStatus.NOT_FOUND);
    }
    this.websocketGateway.emitShiftChanged();
    return updatedShift;
  }

  async removeShift(id: number) {
    const removedShift = await this.shiftModel.findByIdAndRemove(id);
    if (!removedShift) {
      throw new HttpException('Shift not found', HttpStatus.NOT_FOUND);
    }
    this.websocketGateway.emitShiftChanged();
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

    let shiftsData: any[] = [];
    const daysNeedingFetch: string[] = [];
    let cachedShiftsMap: Record<string, any[]> | null = null;
    let source = '';

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
        // Cache yok, tüm günleri DB'den al
        daysNeedingFetch.push(...daysInRange);
      }
    } catch (error) {
      console.error('Failed to retrieve shifts from Redis:', error);
      // Redis hatası, tüm günleri DB'den al
      daysNeedingFetch.push(...daysInRange);
    }

    // DB'den eksik günleri al
    if (daysNeedingFetch.length > 0) {
      source = 'database';
      try {
        const filterQuery: any = {
          day: { $in: daysNeedingFetch },
        };

        const dbShifts = await this.shiftModel.find(filterQuery).exec();
        shiftsData.push(...dbShifts);

        // Cache'i güncelle
        if (dbShifts.length > 0 || daysNeedingFetch.length > 0) {
          try {
            // İlk okunan cache'i kullan, tekrar okuma
            const existingCache = cachedShiftsMap || {};

            // DB'den gelen shift'leri günlere göre grupla ve cache'e ekle
            for (const shift of dbShifts) {
              if (!existingCache[shift.day]) {
                existingCache[shift.day] = [];
              }
              existingCache[shift.day].push(shift);
            }

            // Veri olmayan günler için boş array ekle
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
    } else {
      source = 'cache';
    }

    this.logger.log(`[findQueryShifts] source: ${source}`);

    // Location filtresi uygula
    if (location) {
      shiftsData = shiftsData.filter(
        (shift) => Number(shift.location) === Number(location),
      );
    }

    // Sonucu organize et
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
