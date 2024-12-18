import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { User } from '../user/user.schema';
import { CreateChecklistDto } from './checklist.dto';
import { ChecklistGateway } from './checklist.gateway';
import { Checklist } from './checklist.schema';

@Injectable()
export class ChecklistService {
  constructor(
    @InjectModel(Checklist.name)
    private checklistModel: Model<Checklist>,
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

  //   async removeChecklist(user: User, id: string) {
  //     const counts = await this.countModel.find({ Checklist: id });
  //     if (counts.length > 0) {
  //       throw new HttpException(
  //         'Cannot remove a count list',
  //         HttpStatus.BAD_REQUEST,
  //       );
  //     }
  //     const Checklist = await this.checklistModel.findByIdAndRemove(id);
  //     this.checklistGateway.emitChecklistChanged(user, Checklist);
  //     return Checklist;
  //   }
}
