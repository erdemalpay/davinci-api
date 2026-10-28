import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ActivityModule } from '../activity/activity.module';
import { LocationModule } from '../location/location.module';
import { Location, LocationSchema } from '../location/location.schema';
import { Shift, ShiftSchema } from '../shift/shift.schema';
import { UserModule } from '../user/user.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { MiddlemanController } from './middleman.controller';
import { MiddlemanCronService } from './middleman.cron.service';
import { Middleman, MiddlemanSchema } from './middleman.schema';
import { MiddlemanService } from './middleman.service';
import { MiddlemanPlan, MiddlemanPlanSchema } from './middlemanPlan.schema';

@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      createAutoIncrementConfig(Middleman.name, MiddlemanSchema),
      createAutoIncrementConfig(MiddlemanPlan.name, MiddlemanPlanSchema),
      // Read-only: the days worked in the middleman hours.
      createAutoIncrementConfig(Shift.name, ShiftSchema),
      createAutoIncrementConfig(Location.name, LocationSchema),
    ]),
    WebSocketModule,
    LocationModule,
    UserModule,
    ActivityModule,
  ],
  controllers: [MiddlemanController],
  providers: [MiddlemanService, MiddlemanCronService],
  exports: [MiddlemanService],
})
export class MiddlemanModule {}
