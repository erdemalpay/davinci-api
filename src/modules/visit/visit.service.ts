import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
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
    return this.visitModel.create(createVisitDto);
  }

  createManually(visitDto: VisitDto) {
    return this.visitModel.create(visitDto);
  }

  update(id: number, updateQuery: UpdateQuery<Visit>) {
    return this.visitModel.findByIdAndUpdate(id, updateQuery, {
      new: true,
    });
  }
}
