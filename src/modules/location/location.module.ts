import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { RedisModule } from '../redis/redis.module';
import { LocationController } from './location.controller';
import { Location, LocationSchema } from './location.schema';
import { LocationService } from './location.service';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Location.name, LocationSchema),
]);

@Module({
  imports: [WebSocketModule, RedisModule, mongooseModule],
  controllers: [LocationController],
  providers: [LocationService],
  exports: [LocationService],
})
export class LocationModule {}
