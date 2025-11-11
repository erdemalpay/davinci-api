import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { NotificationModule } from '../notification/notification.module';
import { ShiftController } from './shift.controller';
import { ShiftGateway } from './shift.gateway';
import { Shift, ShiftSchema } from './shift.schema';
import { ShiftService } from './shift.service';
import { ShiftChangeRequestController } from './shiftChange/shiftChangeRequest.controller';
import {
  ShiftChangeRequest,
  ShiftChangeRequestSchema,
} from './shiftChange/shiftChangeRequest.schema';
import { ShiftChangeRequestService } from './shiftChange/shiftChangeRequest.service';
import { UserModule } from '../user/user.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Shift.name, ShiftSchema),
  createAutoIncrementConfig(
    ShiftChangeRequest.name,
    ShiftChangeRequestSchema,
  ),
]);

@Module({
  imports: [mongooseModule, NotificationModule, UserModule],
  providers: [ShiftService, ShiftGateway, ShiftChangeRequestService],
  exports: [ShiftService, ShiftGateway, ShiftChangeRequestService],
  controllers: [ShiftController, ShiftChangeRequestController],
})
export class ShiftModule {}
