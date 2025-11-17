import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { EducationController } from './education.controller';
import { Education, EducationSchema } from './education.schema';
import { EducationService } from './education.service';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Education.name, EducationSchema),
]);
@Module({
  imports: [
    WebSocketModule,mongooseModule],
  controllers: [EducationController],
  providers: [EducationService],
  exports: [EducationService],
})
export class EducationModule {}
