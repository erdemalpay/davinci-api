import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EducationGateway } from './education.gateway';
import { Education } from './education.schema';

@Injectable()
export class EducationService {
  constructor(
    @InjectModel(Education.name) private educationModel: Model<Education>,
    private readonly educationGateway: EducationGateway,
  ) {}
  // Base service with no functions.
}
