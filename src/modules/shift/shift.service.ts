import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { ShiftPlanDto, ShiftSlotDto } from './dto/shift.dto';
import { ShiftPlan } from './shiftPlan.schema';
import { ShiftSlot } from './shiftSlot.schema';

@Injectable()
export class ShiftService {
  constructor(
    @InjectModel(ShiftPlan.name) private shiftPlanModel: Model<ShiftPlan>,
    @InjectModel(ShiftSlot.name) private shiftSlotModel: Model<ShiftSlot>,
  ) {}

  async createPlan(shiftPlanDto: ShiftPlanDto) {
    const slots = await this.shiftSlotModel.find({ active: true });
    return this.shiftPlanModel.create({ ...shiftPlanDto, slots });
  }

  async createSlot(shiftSlotDto: ShiftSlotDto) {
    return this.shiftSlotModel.create(shiftSlotDto);
  }

  findAll() {
    return this.shiftPlanModel.find().sort({ startDate: 'desc' });
  }

  findById(id: number) {
    return this.shiftPlanModel.findById(id);
  }

  update(id: number, updates: UpdateQuery<ShiftPlan>) {
    return this.shiftPlanModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }

  remove(id: number) {
    return this.shiftPlanModel.findByIdAndDelete(id);
  }

  close(id: number, finishHour: string) {
    return this.shiftPlanModel.findByIdAndUpdate(
      id,
      {
        finishHour,
      },
      { new: true },
    );
  }
}
