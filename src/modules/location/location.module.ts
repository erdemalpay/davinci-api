import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { LocationController } from './location.controller';
import { LocationGateway } from './location.gateway';
import { Location, LocationSchema } from './location.schema';
import { LocationService } from './location.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Location.name, LocationSchema),
]);

@Module({
  imports: [mongooseModule],
  controllers: [LocationController],
  providers: [LocationService, LocationGateway],
})
export class LocationModule {}
