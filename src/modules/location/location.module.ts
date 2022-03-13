import { Module } from '@nestjs/common';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Location, LocationSchema } from './location.schema';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Location.name, LocationSchema),
]);

@Module({
  imports: [mongooseModule],
  controllers: [LocationController],
  providers: [LocationService],
})
export class LocationModule {}
