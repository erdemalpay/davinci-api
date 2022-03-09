import { Module } from '@nestjs/common';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Location, LocationSchema } from './location.schema';

const mongooseModule = MongooseModule.forFeature([
  { name: Location.name, schema: LocationSchema },
]);

@Module({
  imports: [mongooseModule],
  controllers: [LocationController],
  providers: [LocationService],
})
export class LocationModule {}
