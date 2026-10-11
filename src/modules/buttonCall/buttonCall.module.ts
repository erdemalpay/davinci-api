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
import { Location, LocationSchema } from '../location/location.schema';
import { Middleman, MiddlemanSchema } from '../middleman/middleman.schema';
import { Order, OrderSchema } from '../order/order.schema';
import { Shift, ShiftSchema } from '../shift/shift.schema';
import { Table, TableSchema } from '../table/table.schema';
import { User, UserSchema } from '../user/user.schema';
import { Visit, VisitSchema } from '../visit/visit.schema';
import { ButtonCallAssignmentService } from './buttonCall.assignment.service';
import { ButtonCallController } from './buttonCall.controller';
import { ButtonCallService } from './buttonCall.service';
import { UnmetExplanationRequestService } from './unmetExplanationRequest.service';
import { ButtonCall, ButtonCallSchema } from './schemas/buttonCall.schema';
import {
  UnmetExplanationRequest,
  UnmetExplanationRequestSchema,
} from './schemas/unmetExplanationRequest.schema';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(ButtonCall.name, ButtonCallSchema),
  createAutoIncrementConfig(
    UnmetExplanationRequest.name,
    UnmetExplanationRequestSchema,
  ),
  // Read-only access for call assignment (who is available right now).
  createAutoIncrementConfig(Visit.name, VisitSchema),
  createAutoIncrementConfig(Break.name, BreakSchema),
  createAutoIncrementConfig(Middleman.name, MiddlemanSchema),
  createAutoIncrementConfig(GameplayTime.name, GameplayTimeSchema),
  createAutoIncrementConfig(Gameplay.name, GameplaySchema),
  createAutoIncrementConfig(Shift.name, ShiftSchema),
  createAutoIncrementConfig(Table.name, TableSchema),
  createAutoIncrementConfig(Location.name, LocationSchema),
  // Baristas only get service calls while no order is waiting.
  createAutoIncrementConfig(Order.name, OrderSchema),
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
  providers: [
    ButtonCallService,
    ButtonCallAssignmentService,
    UnmetExplanationRequestService,
  ],
  exports: [ButtonCallService],
  controllers: [ButtonCallController],
})
export class ButtonCallModule {}
