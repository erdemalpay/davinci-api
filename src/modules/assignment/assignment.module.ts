import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { WebSocketModule } from '../websocket/websocket.module';
import { AssignmentController } from './assignment.controller';
import { Assignment, AssignmentSchema } from './assignment.schema';
import { AssignmentService } from './assignment.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Assignment.name, AssignmentSchema),
]);
@Module({
  imports: [mongooseModule, WebSocketModule],
  controllers: [AssignmentController],
  providers: [AssignmentService],
  exports: [AssignmentService, mongooseModule],
})
export class AssignmentModule {}
