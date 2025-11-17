import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { UserModule } from 'src/modules/user/user.module';
import { ActivityModule } from '../activity/activity.module';
import { LocationModule } from '../location/location.module';
import { NotificationModule } from '../notification/notification.module';
import { ShiftModule } from '../shift/shift.module';
import { CafeActivity, CafeActivitySchema } from './cafeActivity.schema';
import { VisitController } from './visit.controller';
import { VisitCronService } from './visit.cron.service';
import { Visit, VisitSchema } from './visit.schema';
import { VisitService } from './visit.service';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Visit.name, VisitSchema),
  createAutoIncrementConfig(CafeActivity.name, CafeActivitySchema),
]);

@Module({
  imports: [
    WebSocketModule,
    mongooseModule,
    UserModule,
    NotificationModule,
    LocationModule,
    ShiftModule,
    ActivityModule,
  ],
  providers: [VisitService, VisitCronService],
  exports: [VisitService],
  controllers: [VisitController],
})
export class VisitModule {}
