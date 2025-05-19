import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { addHours, format, subDays } from 'date-fns';
import { Model, UpdateQuery } from 'mongoose';
import { LocationService } from '../location/location.service';
import { NotificationService } from '../notification/notification.service';
import { User } from '../user/user.schema';
import { UserService } from '../user/user.service';
import { ShiftService } from './../shift/shift.service';
import { CafeActivity } from './cafeActivity.schema';
import { CreateVisitDto } from './create.visit.dto';
import {
  CafeActivityDto,
  CafeVisitDto,
  VisitDto,
  VisitTypes,
} from './visit.dto';
import { VisitGateway } from './visit.gateway';
import { Visit } from './visit.schema';

export class VisitService {
  constructor(
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
    @InjectModel(CafeActivity.name)
    private cafeActivityModel: Model<CafeActivity>,
    private readonly visitGateway: VisitGateway,
    private readonly userService: UserService,
    private readonly notificationService: NotificationService,
    private readonly locationService: LocationService,
    private readonly shiftService: ShiftService,
  ) {}

  findByDateAndLocation(date: string, location: number) {
    return this.visitModel.find({ date, location });
  }

  findMonthlyByLocation(date: string, location: number) {
    return this.visitModel.find({
      date: { $gte: `${date}-01`, $lte: `${date}-31` },
      location,
    });
  }

  findOneByQuery(visitDto: VisitDto) {
    return this.visitModel.findOne(visitDto);
  }

  async create(user: User, createVisitDto: CreateVisitDto) {
    const visit = await this.visitModel.create({
      ...createVisitDto,
      user: user._id,
    });

    const shifts = await this.shiftService.findQueryShifts({
      after: createVisitDto.date,
      before: createVisitDto.date,
      location: createVisitDto.location,
    });
    const foundShift = shifts[0]?.shifts?.find((shift) => {
      return shift.user.includes(user._id);
    });
    if (foundShift) {
      if (createVisitDto.startHour > foundShift.shift) {
        await this.notificationService.createNotification({
          type: 'WARNING',
          selectedUsers: [user._id],
          selectedRoles: [1],
          seenBy: [],
          event: '',
          message: `${user.name} are late for shift. Shift was at ${foundShift.shift} and ${user.name} entered at ${createVisitDto.startHour}`,
        });
      }
    }
    this.visitGateway.emitVisitChanged(user, visit);
    return visit;
  }

  createManually(visitDto: VisitDto) {
    return this.visitModel.create(visitDto);
  }

  async finish(user: User, id: number) {
    const gmtPlus3Now = addHours(new Date(), 3);
    const finishHour = format(gmtPlus3Now, 'HH:mm');
    const visit = await this.visitModel.findByIdAndUpdate(
      id,
      { finishHour },
      {
        new: true,
      },
    );
    this.visitGateway.emitVisitChanged(user, visit);
    return visit;
  }

  async getVisits(startDate: string, endDate?: string, user?: string) {
    let query: any = { date: { $gte: startDate } };
    if (endDate) {
      query = { ...query, date: { ...query.date, $lte: endDate } };
    }
    if (user) {
      query = { ...query, user };
    }
    const visits = await this.visitModel
      .find(query, { __v: false, _id: false })
      .populate({
        path: 'user',
        select: '-password',
      })
      .sort({ date: 1, location: 1 })
      .lean();

    return visits.map((visit) => {
      return {
        ...visit,
        role: visit.user.role,
        user: visit.user._id,
      };
    });
  }

  async getUniqueVisits(startDate: string, endDate?: string) {
    let matchStage: any = { date: { $gte: startDate } };
    if (endDate) {
      matchStage.date.$lte = endDate;
    }

    const visits = await this.visitModel.aggregate([
      { $match: matchStage },
      {
        $sort: { date: 1, user: 1, startHour: 1 },
      },
      {
        $group: {
          _id: { user: '$user', date: '$date' },
          visit: { $first: '$$ROOT' },
        },
      },
      {
        $replaceRoot: { newRoot: '$visit' },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $unwind: '$user',
      },
      {
        $project: {
          user: '$user._id',
          role: '$user.role',
          location: 1,
          date: 1,
          startHour: 1,
          finishHour: 1,
        },
      },
    ]);

    return visits;
  }

  async createVisitFromCafe(cafeVisitDto: CafeVisitDto) {
    const user = await this.userService.findByCafeId(cafeVisitDto.userData);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (cafeVisitDto?.type === VisitTypes.ENTRY) {
      const lastVisit = await this.visitModel
        .findOne({
          user: user._id,
          date: cafeVisitDto.date,
          location: cafeVisitDto.location,
        })
        .sort({ startHour: -1 });
      if (lastVisit && !lastVisit.finishHour) {
        return lastVisit;
      }
      const visit = await this.visitModel.create({
        user: user._id,
        location: cafeVisitDto.location,
        date: cafeVisitDto.date,
        startHour: cafeVisitDto.hour,
      });
      const shifts = await this.shiftService.findQueryShifts({
        after: cafeVisitDto.date,
        before: cafeVisitDto.date,
        location: cafeVisitDto.location,
      });
      const foundShift = shifts[0]?.shifts?.find((shift) => {
        return shift.user.includes(user._id);
      });
      if (foundShift) {
        if (cafeVisitDto.hour > foundShift.shift) {
          await this.notificationService.createNotification({
            type: 'WARNING',
            selectedUsers: [user._id],
            selectedRoles: [1],
            seenBy: [],
            event: '',
            message: `${user.name} are late for shift. Shift was at ${foundShift.shift} and ${user.name} entered at ${cafeVisitDto.hour}`,
          });
        }
      }

      this.visitGateway.emitVisitChanged(user, visit);
      return visit;
    }
    if (cafeVisitDto?.type === VisitTypes.EXIT) {
      const previousDay = format(
        subDays(new Date(cafeVisitDto.date), 1),
        'yyyy-MM-dd',
      );
      const lastVisit = await this.visitModel
        .findOne({
          user: user._id,
          location: cafeVisitDto.location,
          $or: [
            { date: cafeVisitDto.date },
            { date: previousDay, startHour: { $gt: cafeVisitDto.hour } },
          ],
        })
        .sort({ date: -1, startHour: -1 });
      if (lastVisit) {
        await lastVisit.updateOne({ finishHour: cafeVisitDto.hour });
        this.visitGateway.emitVisitChanged(user, lastVisit);
        return lastVisit;
      }
      const visit = await this.visitModel.create({
        user: user._id,
        location: cafeVisitDto.location,
        date: cafeVisitDto.date,
        startHour: cafeVisitDto.hour,
        finishHour: cafeVisitDto.hour,
      });
      this.visitGateway.emitVisitChanged(user, visit);
      return visit;
    }
    throw new BadRequestException();
  }

  async createCafeActivity(dto: CafeActivityDto) {
    const activity = await this.cafeActivityModel.create(dto);
    this.visitGateway.emitCafeActivityChanged(activity);
    return activity;
  }

  async findAllCafeActivity() {
    return this.cafeActivityModel.find().exec();
  }
  async updateCafeActivity(id: number, updates: UpdateQuery<CafeActivityDto>) {
    const activity = await this.cafeActivityModel.findOneAndUpdate(
      { _id: id },
      updates,
      { new: true },
    );
    if (!activity) {
      throw new NotFoundException(`CafeActivity with id ${id} not found`);
    }
    this.visitGateway.emitCafeActivityChanged(activity);
    return activity;
  }

  async deleteCafeActivity(id: number) {
    const activity = await this.cafeActivityModel.findOneAndDelete({ _id: id });
    if (!activity) {
      throw new NotFoundException(`CafeActivity with id ${id} not found`);
    }
    this.visitGateway.emitCafeActivityChanged(activity);
    return activity;
  }
}
