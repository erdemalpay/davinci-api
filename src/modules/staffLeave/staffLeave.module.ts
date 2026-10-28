import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { WebSocketModule } from '../websocket/websocket.module';
import { StaffLeaveController } from './staffLeave.controller';
import {
  StaffLeave,
  StaffLeaveSchema,
  StaffLeaveType,
  StaffLeaveTypeSchema,
} from './staffLeave.schema';
import { StaffLeaveService } from './staffLeave.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(StaffLeaveType.name, StaffLeaveTypeSchema),
  createAutoIncrementConfig(StaffLeave.name, StaffLeaveSchema),
]);

@Module({
  imports: [WebSocketModule, mongooseModule],
  controllers: [StaffLeaveController],
  providers: [StaffLeaveService],
})
export class StaffLeaveModule {}
