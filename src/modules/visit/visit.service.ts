import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { format } from 'date-fns';

import { Visit } from './visit.schema';
import { VisitDto } from './visit.dto';
import { CreateVisitDto } from './create.visit.dto';

export class VisitService {
  constructor(@InjectModel(Visit.name) private visitModel: Model<Visit>) {}

  findByDateAndLocation(date: string, location: number) {
    return this.visitModel
      .find({ date, location })
      .populate({ path: 'user', select: '_id name role active' });
  }

  findMonthlyByLocation(date: string, location: number) {
    return this.visitModel
      .find({ date: { $gte: `${date}-01`, $lte: `${date}-31` }, location })
      .populate({ path: 'user', select: '_id name' });
  }

  findOneByQuery(visitDto: VisitDto) {
    return this.visitModel.findOne(visitDto);
  }

  create(createVisitDto: CreateVisitDto) {
    return this.visitModel.create({
      user: createVisitDto.user,
      location: createVisitDto.location,
      date: format(new Date(), 'yyyy-MM-dd'),
      startHour: format(new Date(), 'HH:mm'),
    });
  }

  createManually(visitDto: VisitDto) {
    return this.visitModel.create(visitDto);
  }

  finish(id: number) {
    return this.visitModel.findByIdAndUpdate(
      id,
      { finishHour: format(new Date(), 'HH:mm') },
      {
        new: true,
      },
    );
  }
}
