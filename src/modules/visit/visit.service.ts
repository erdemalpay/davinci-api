import { InjectModel } from '@nestjs/mongoose';
import { addHours, format } from 'date-fns';
import { Model } from 'mongoose';
import { User } from '../user/user.schema';
import { UserService } from '../user/user.service';
import { CreateVisitDto } from './create.visit.dto';
import { CafeVisitDto, VisitDto, VisitTypes } from './visit.dto';
import { VisitGateway } from './visit.gateway';
import { Visit } from './visit.schema';

export class VisitService {
  constructor(
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
    private readonly visitGateway: VisitGateway,
    private readonly userService: UserService,
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
      .populate('user')
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

  async createVisitFromCafe(cafeVisitDto: CafeVisitDto) {
    const user = await this.userService.findByCafeId(cafeVisitDto.userData);
    if (!user) {
      throw new Error('User not found');
    }
    const visit = await this.visitModel.create({
      user: user._id,
      location: cafeVisitDto.location,
      date: cafeVisitDto.date,
      ...(cafeVisitDto?.type === VisitTypes.ENTRY && {
        startHour: cafeVisitDto.hour,
      }),
      ...(cafeVisitDto?.type === VisitTypes.EXIT && {
        finishHour: cafeVisitDto.hour,
      }),
    });
    this.visitGateway.emitVisitChanged(user, visit);
    return visit;
  }
}
