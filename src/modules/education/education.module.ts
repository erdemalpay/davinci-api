import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { EducationController } from './education.controller';
import { EducationGateway } from './education.gateway';
import { Education, EducationSchema } from './education.schema';
import { EducationService } from './education.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Education.name, EducationSchema),
]);
@Module({
  imports: [mongooseModule],
  controllers: [EducationController],
  providers: [EducationService, EducationGateway],
  exports: [EducationService, EducationGateway],
})
export class EducationModule {}
