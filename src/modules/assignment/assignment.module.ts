import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { NotificationModule } from '../notification/notification.module';
import { AssignmentCronService } from './assignment.cron.service';
import { AssignmentController } from './assignment.controller';
import { Assignment, AssignmentSchema } from './assignment.schema';
import { AssignmentService } from './assignment.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Assignment.name, AssignmentSchema),
]);
@Module({
  imports: [mongooseModule, forwardRef(() => NotificationModule)],
  controllers: [AssignmentController],
  providers: [AssignmentService, AssignmentCronService],
  exports: [AssignmentService],
})
export class AssignmentModule {}
