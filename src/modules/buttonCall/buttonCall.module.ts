import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ActivityModule } from '../activity/activity.module';
import { LocationModule } from '../location/location.module';
import { UserModule } from '../user/user.module';
import { Break, BreakSchema } from '../break/break.schema';
import { Gameplay, GameplaySchema } from '../gameplay/gameplay.schema';
import {
  GameplayTime,
  GameplayTimeSchema,
} from '../gameplaytime/gameplaytime.schema';
import { Middleman, MiddlemanSchema } from '../middleman/middleman.schema';
import { Shift, ShiftSchema } from '../shift/shift.schema';
import { Table, TableSchema } from '../table/table.schema';
import { User, UserSchema } from '../user/user.schema';
import { Visit, VisitSchema } from '../visit/visit.schema';
import { ButtonCallAssignmentService } from './buttonCall.assignment.service';
import { ButtonCallController } from './buttonCall.controller';
import { ButtonCallService } from './buttonCall.service';
import { ButtonCall, ButtonCallSchema } from './schemas/buttonCall.schema';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(ButtonCall.name, ButtonCallSchema),
  // Read-only access for call assignment (who is available right now).
  createAutoIncrementConfig(Visit.name, VisitSchema),
  createAutoIncrementConfig(Break.name, BreakSchema),
  createAutoIncrementConfig(Middleman.name, MiddlemanSchema),
  createAutoIncrementConfig(GameplayTime.name, GameplayTimeSchema),
  createAutoIncrementConfig(Gameplay.name, GameplaySchema),
  createAutoIncrementConfig(Shift.name, ShiftSchema),
  createAutoIncrementConfig(Table.name, TableSchema),
  { name: User.name, useFactory: () => UserSchema },
]);

@Module({
  imports: [
    WebSocketModule,
    mongooseModule,
    UserModule,
    HttpModule,
    ActivityModule,
    forwardRef(() => LocationModule),
  ],
  providers: [ButtonCallService, ButtonCallAssignmentService],
  exports: [ButtonCallService],
  controllers: [ButtonCallController],
})
export class ButtonCallModule {}
