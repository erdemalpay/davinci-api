import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { CreateEducationDto } from './education.dto';
import { Education } from './education.schema';

@Injectable()
export class EducationService {
  constructor(
    @InjectModel(Education.name) private educationModel: Model<Education>,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  async createEducation(createEducationDto: CreateEducationDto) {
    const createdEducation = new this.educationModel(createEducationDto);
    await createdEducation.save();
    this.websocketGateway.emitEducationChanged();
    return createdEducation;
  }

  async updateEducation(user: User, id: number, updates: Record<string, any>) {
    const prev = await this.educationModel.findById(id).lean();
    if (!prev)
      throw new HttpException('Education not found', HttpStatus.NOT_FOUND);
    const { updateHistory: _, ...fieldsToSet } = updates;
    const keys = Object.keys(fieldsToSet);
    const onlyOrder = keys.length === 1 && keys[0] === 'order';
    const mongoUpdate: any = { $set: fieldsToSet };
    if (!onlyOrder) {
      const diff: Record<string, { before: any; after: any }> = {};
      for (const k of keys) {
        if (k !== 'order') {
          diff[k] = { before: (prev as any)[k], after: fieldsToSet[k] };
        }
      }
      mongoUpdate.$push = {
        updateHistory: {
          user: user._id,
          updatedAt: new Date(),
          updates: diff,
        },
      };
    }
    const updatedEducation = await this.educationModel.findByIdAndUpdate(
      id,
      mongoUpdate,
      { new: true },
    );
    if (!updatedEducation) {
      throw new HttpException('Education not found', HttpStatus.NOT_FOUND);
    }

    this.websocketGateway.emitEducationChanged();
    return updatedEducation;
  }

  async updateEducationOrder(id: number, newOrder: number) {
    const item = await this.educationModel.findById(id);
    if (!item) {
      throw new HttpException('Education not found', HttpStatus.NOT_FOUND);
    }
    await this.educationModel.findByIdAndUpdate(id, { order: newOrder });

    await this.educationModel.updateMany(
      { _id: { $ne: id }, order: { $gte: newOrder } },
      { $inc: { order: 1 } },
    );

    this.websocketGateway.emitEducationChanged();
  }

  async removeEducation(id: number) {
    const removedEducation = await this.educationModel.findByIdAndRemove(id);
    if (!removedEducation) {
      throw new HttpException('Education not found', HttpStatus.NOT_FOUND);
    }
    this.websocketGateway.emitEducationChanged();
    return removedEducation;
  }

  async findAllEducation() {
    try {
      const educationDocs = await this.educationModel
        .find()
        .sort({
          order: 'asc',
        })
        .exec();
      return educationDocs;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch educations',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
