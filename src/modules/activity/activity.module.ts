import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ActivityController } from './activity.controller';
import { ActivityGateway } from './activity.gateway';
import { Activity, ActivitySchema } from './activity.schema';
import { ActivityService } from './activity.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Activity.name, ActivitySchema),
]);
//deneme
@Module({
  imports: [mongooseModule],
  providers: [ActivityService, ActivityGateway],
  controllers: [ActivityController],
  exports: [ActivityService, ActivityGateway],
})
export class ActivityModule {}
