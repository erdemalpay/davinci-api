import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { UpstairsDuty } from './upstairsDuty.schema';

@Injectable()
export class UpstairsDutyService {
  constructor(
    @InjectModel(UpstairsDuty.name)
    private readonly upstairsDutyModel: Model<UpstairsDuty>,
  ) {}

  // The day's duties at a location (or everywhere), oldest first.
  find(date: string, location?: number) {
    const filter: FilterQuery<UpstairsDuty> = { date };
    if (location) filter.location = location;
    return this.upstairsDutyModel.find(filter).sort({ _id: 1 }).lean();
  }
}
