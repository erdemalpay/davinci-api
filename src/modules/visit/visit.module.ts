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
import { VisitGateway } from './visit.gateway';
import { Visit, VisitSchema } from './visit.schema';
import { VisitService } from './visit.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Visit.name, VisitSchema),
  createAutoIncrementConfig(CafeActivity.name, CafeActivitySchema),
]);

@Module({
  imports: [
    mongooseModule,
    UserModule,
    NotificationModule,
    LocationModule,
    ShiftModule,
    ActivityModule,
  ],
  providers: [VisitService, VisitGateway],
  exports: [VisitService, VisitGateway],
  controllers: [VisitController],
})
export class VisitModule {}
