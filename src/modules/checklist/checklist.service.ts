import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { User } from '../user/user.schema';
import { Check } from './check.schema';
import { CreateCheckDto, CreateChecklistDto } from './checklist.dto';
import { ChecklistGateway } from './checklist.gateway';
import { Checklist } from './checklist.schema';

@Injectable()
export class ChecklistService {
  constructor(
    @InjectModel(Checklist.name)
    private checklistModel: Model<Checklist>,
    @InjectModel(Check.name) private checkModel: Model<Check>,
    private checklistGateway: ChecklistGateway,
  ) {}

  async createChecklist(user: User, createChecklistDto: CreateChecklistDto) {
    const checklist = new this.checklistModel(createChecklistDto);
    checklist._id = usernamify(checklist.name);
    checklist.locations = [1, 2];
    checklist.active = true;
    await checklist.save();
    this.checklistGateway.emitChecklistChanged(user, checklist);
    return checklist;
  }

  findAllChecklist() {
    return this.checklistModel.find();
  }

  async updateChecklist(
    user: User,
    id: string,
    updates: UpdateQuery<Checklist>,
  ) {
    const checklist = await this.checklistModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.checklistGateway.emitChecklistChanged(user, checklist);
    return checklist;
  }

  async removeChecklist(user: User, id: string) {
    const checks = await this.checkModel.find({ checklist: id });
    if (checks.length > 0) {
      throw new HttpException(
        'Cannot remove a checklist',
        HttpStatus.BAD_REQUEST,
      );
    }
    const checklist = await this.checklistModel.findByIdAndRemove(id);
    this.checklistGateway.emitChecklistChanged(user, checklist);
    return checklist;
  }

  findAllChecks() {
    return this.checkModel.find().sort({ isCompleted: 1, completedAt: -1 });
  }

  async createCheck(user: User, createCheckDto: CreateCheckDto) {
    const checks = await this.checkModel.find({
      isCompleted: false,
      user: createCheckDto.user,
      location: createCheckDto.location,
      checklist: createCheckDto.checklist,
    });
    if (checks.length > 0) {
      throw new HttpException(
        'Check already exists and not finished',
        HttpStatus.BAD_REQUEST,
      );
    }
    const check = new this.checkModel(createCheckDto);
    check._id = usernamify(check.user + new Date().toISOString());
    this.checklistGateway.emitCheckChanged(user, check);
    return check.save();
  }

  async updateCheck(user: User, id: string, updates: UpdateQuery<Check>) {
    const check = await this.checkModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.checklistGateway.emitCheckChanged(user, check);
    return check;
  }

  async removeCheck(user: User, id: string) {
    const check = await this.checkModel.findByIdAndRemove(id);
    this.checklistGateway.emitCheckChanged(user, check);
    return check;
  }
}
