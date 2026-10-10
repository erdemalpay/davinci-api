import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ActivityModule } from '../activity/activity.module';
import {
  ButtonCall,
  ButtonCallSchema,
} from '../buttonCall/schemas/buttonCall.schema';
import { LocationModule } from '../location/location.module';
import { NotificationModule } from '../notification/notification.module';
import { UserModule } from '../user/user.module';
import { WebSocketModule } from '../websocket/websocket.module';
import {
  GameplayTime,
  GameplayTimeSchema,
} from '../gameplaytime/gameplaytime.schema';
import { Middleman, MiddlemanSchema } from '../middleman/middleman.schema';
import { Shift, ShiftSchema } from '../shift/shift.schema';
import { Visit, VisitSchema } from '../visit/visit.schema';
import { BreakController } from './break.controller';
import { Break, BreakSchema } from './break.schema';
import { BreakService } from './break.service';

@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      createAutoIncrementConfig(Break.name, BreakSchema),
      // Read-only: a break can't start while a GM call is assigned.
      createAutoIncrementConfig(ButtonCall.name, ButtonCallSchema),
      // Read-only: explanation and middleman times for the daily summary.
      createAutoIncrementConfig(GameplayTime.name, GameplayTimeSchema),
      createAutoIncrementConfig(Middleman.name, MiddlemanSchema),
      // Read-only: who is in the cafe and outside operation, for the
      // concurrent break warning.
      createAutoIncrementConfig(Visit.name, VisitSchema),
      createAutoIncrementConfig(Shift.name, ShiftSchema),
    ]),
    WebSocketModule,
    LocationModule,
    UserModule,
    ActivityModule,
    NotificationModule,
  ],
  controllers: [BreakController],
  providers: [BreakService],
  exports: [BreakService],
})
export class BreakModule {}
