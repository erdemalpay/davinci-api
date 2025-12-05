import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { Consumer, ConsumerSchema } from '../consumer/consumer.schema';
import { User, UserSchema } from '../user/user.schema';
import { PointController } from './point.controller';
import { Point, PointSchema } from './point.schema';
import { PointService } from './point.service';
import { PointHistory, PointHistorySchema } from './pointHistory.schema';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Point.name, PointSchema),
  createAutoIncrementConfig(PointHistory.name, PointHistorySchema),
  { name: Consumer.name, useFactory: () => ConsumerSchema },
  { name: User.name, useFactory: () => UserSchema },
]);

@Module({
  imports: [
    WebSocketModule,
    mongooseModule,
  ],
  providers: [PointService],
  controllers: [PointController],
  exports: [mongooseModule, PointService, PointModule],
})
export class PointModule {}
