import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { Activity, ActivitySchema } from './activity.schema';
import { ActivityService } from './activity.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Activity.name, ActivitySchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
