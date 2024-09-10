import { InjectModel } from '@nestjs/mongoose';
import { addHours, format } from 'date-fns';
import { Model } from 'mongoose';

import { User } from '../user/user.schema';
import { CreateVisitDto } from './create.visit.dto';
import { VisitDto } from './visit.dto';
import { VisitGateway } from './visit.gateway';
import { Visit } from './visit.schema';

export class VisitService {
  constructor(
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
    private readonly visitGateway: VisitGateway,
  ) {}

  findByDateAndLocation(date: string, location: number) {
    return this.visitModel.find({ date, location }).populate({
      path: 'user',
      select: '_id name role active',
      populate: 'role',
    });
  }

  findMonthlyByLocation(date: string, location: number) {
    return this.visitModel
      .find({ date: { $gte: `${date}-01`, $lte: `${date}-31` }, location })
      .populate({ path: 'user', select: '_id name' });
  }

  findOneByQuery(visitDto: VisitDto) {
    return this.visitModel.findOne(visitDto);
  }

  async create(user: User, createVisitDto: CreateVisitDto) {
    // Server is running on UTC but we want to record times according to GMT+3
    const gmtPlus3Now = addHours(new Date(), 3);
    const startHour = format(gmtPlus3Now, 'HH:mm');
    const date = format(gmtPlus3Now, 'yyyy-MM-dd');
    const visit = await this.visitModel.create({
      ...createVisitDto,
      date,
      startHour,
      user,
    });
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

  async getVisits(startDate: string, endDate: string) {
    const visits = await this.visitModel
      .find(
        { date: { $gte: startDate, $lte: endDate } },
        { __v: false, _id: false },
      )
      .sort({ date: 1, location: 1 })
      .populate('user')
      .lean();

    return visits.map((visit) => {
      return {
        ...visit,
        role: visit.user.role,
        user: visit.user._id,
      };
    });
  }
}
