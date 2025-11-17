import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { PointController } from './point.controller';
import { Point, PointSchema } from './point.schema';
import { PointService } from './point.service';
import { PointHistory, PointHistorySchema } from './pointHistory.schema';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Point.name, PointSchema),
  createAutoIncrementConfig(PointHistory.name, PointHistorySchema),
]);

@Module({
  imports: [
    WebSocketModule,mongooseModule],
  providers: [PointService],
  controllers: [PointController],
  exports: [mongooseModule, PointService, PointModule],
})
export class PointModule {}
