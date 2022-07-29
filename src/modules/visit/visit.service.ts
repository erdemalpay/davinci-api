import { InjectModel } from '@nestjs/mongoose';
import { Visit } from './visit.schema';
import { Model } from 'mongoose';
import { VisitDto } from './visit.dto';

export class VisitService {
  constructor(@InjectModel(Visit.name) private visitModel: Model<Visit>) {}

  findByDateAndLocation(date: string, location: number) {
    return this.visitModel.find({ date, location }).populate('user');
  }

  findOneByQuery(visitDto: VisitDto) {
    return this.visitModel.findOne(visitDto);
  }

  create(createVisitDto: VisitDto) {
    return this.visitModel.create(createVisitDto);
  }

  update(id: number, updateVisitDto: VisitDto) {
    return this.visitModel.findOneAndUpdate({ _id: id }, updateVisitDto, {
      new: true,
    });
  }
}
