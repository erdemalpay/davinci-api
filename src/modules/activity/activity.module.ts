import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ActivityController } from './activity.controller';
import { Activity, ActivitySchema } from './activity.schema';
import { ActivityService } from './activity.service';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Activity.name, ActivitySchema),
]);

@Module({
  imports: [
    WebSocketModule,mongooseModule],
  providers: [ActivityService],
  controllers: [ActivityController],
  exports: [ActivityService],
})
export class ActivityModule {}
