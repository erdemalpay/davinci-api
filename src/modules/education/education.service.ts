import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { User } from '../user/user.schema';
import { CreateEducationDto } from './education.dto';
import { EducationGateway } from './education.gateway';
import { Education } from './education.schema';

@Injectable()
export class EducationService {
  constructor(
    @InjectModel(Education.name) private educationModel: Model<Education>,
    private readonly educationGateway: EducationGateway,
  ) {}

  async createEducation(user: User, createEducationDto: CreateEducationDto) {
    const createdEducation = new this.educationModel(createEducationDto);
    await createdEducation.save();
    this.educationGateway.emitEducationChanged(user, createdEducation);
    return createdEducation;
  }

  async updateEducation(
    user: User,
    id: number,
    updates: UpdateQuery<Education>,
  ) {
    const updatedEducation = await this.educationModel.findByIdAndUpdate(
      id,
      updates,
      { new: true },
    );
    if (!updatedEducation) {
      throw new HttpException('Education not found', HttpStatus.NOT_FOUND);
    }
    this.educationGateway.emitEducationChanged(user, updatedEducation);
    return updatedEducation;
  }

  async removeEducation(user: User, id: number) {
    const removedEducation = await this.educationModel.findByIdAndRemove(id);
    if (!removedEducation) {
      throw new HttpException('Education not found', HttpStatus.NOT_FOUND);
    }
    this.educationGateway.emitEducationChanged(user, removedEducation);
    return removedEducation;
  }

  async findAllEducation() {
    try {
      const educationDocs = await this.educationModel.find().exec();
      return educationDocs;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch educations',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
