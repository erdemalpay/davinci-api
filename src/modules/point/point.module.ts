import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { PointController } from './point.controller';
import { PointGateway } from './point.gateway';
import { Point, PointSchema } from './point.schema';
import { PointService } from './point.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Point.name, PointSchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [PointService, PointGateway],
  controllers: [PointController],
  exports: [mongooseModule, PointService, PointModule, PointGateway],
})
export class PointModule {}
