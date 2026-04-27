import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { CreateMonthlyActivityDto } from './monthly-activity.dto';
import { MonthlyActivity } from './monthly-activity.schema';

@Injectable()
export class MonthlyActivityService {
  constructor(
    @InjectModel(MonthlyActivity.name)
    private readonly monthlyActivityModel: Model<MonthlyActivity>,
  ) {}

  findAll() {
    return this.monthlyActivityModel.find().sort({ _id: -1 }).exec();
  }

  findLatest() {
    return this.monthlyActivityModel.findOne().sort({ _id: -1 }).exec();
  }

  async create(dto: CreateMonthlyActivityDto) {
    return this.monthlyActivityModel.create(dto);
  }

  async update(id: number, updates: UpdateQuery<MonthlyActivity>) {
    return this.monthlyActivityModel
      .findByIdAndUpdate(id, updates, { new: true })
      .exec();
  }

  async remove(id: number) {
    return this.monthlyActivityModel.findByIdAndDelete(id).exec();
  }
}
