import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Visit } from './visit.schema';

@Injectable()
export class OldVisitService {
  constructor(@InjectModel(Visit.name) private visitModel: Model<Visit>) {}

  async getAll(): Promise<Visit[]> {
    return this.visitModel
      .find({
        date: { $gte: '2022-07-01' },
      })
      .populate('user');
  }
}
