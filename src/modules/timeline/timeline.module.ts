import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { Break, BreakSchema } from '../break/break.schema';
import {
  ButtonCall,
  ButtonCallSchema,
} from '../buttonCall/schemas/buttonCall.schema';
import { Gameplay, GameplaySchema } from '../gameplay/gameplay.schema';
import {
  GameplayTime,
  GameplayTimeSchema,
} from '../gameplaytime/gameplaytime.schema';
import { Middleman, MiddlemanSchema } from '../middleman/middleman.schema';
import { Collection, CollectionSchema } from '../order/collection.schema';
import { Order, OrderSchema } from '../order/order.schema';
import { Shift, ShiftSchema } from '../shift/shift.schema';
import { Table, TableSchema } from '../table/table.schema';
import {
  UpstairsDuty,
  UpstairsDutySchema,
} from '../upstairsDuty/upstairsDuty.schema';
import { User, UserSchema } from '../user/user.schema';
import { Visit, VisitSchema } from '../visit/visit.schema';
import { TimelineController } from './timeline.controller';
import { TimelineService } from './timeline.service';

// Read-only: person and table timelines for managers.
const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Table.name, TableSchema),
  createAutoIncrementConfig(Gameplay.name, GameplaySchema),
  createAutoIncrementConfig(GameplayTime.name, GameplayTimeSchema),
  createAutoIncrementConfig(ButtonCall.name, ButtonCallSchema),
  createAutoIncrementConfig(Order.name, OrderSchema),
  createAutoIncrementConfig(Collection.name, CollectionSchema),
  createAutoIncrementConfig(Visit.name, VisitSchema),
  createAutoIncrementConfig(Break.name, BreakSchema),
  createAutoIncrementConfig(Middleman.name, MiddlemanSchema),
  createAutoIncrementConfig(Shift.name, ShiftSchema),
  createAutoIncrementConfig(UpstairsDuty.name, UpstairsDutySchema),
  // User ids are names, not numbers.
  { name: User.name, useFactory: () => UserSchema },
]);

@Module({
  imports: [mongooseModule],
  providers: [TimelineService],
  controllers: [TimelineController],
})
export class TimelineModule {}
