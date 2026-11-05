import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { WebSocketModule } from '../websocket/websocket.module';
import { EventCalendarController } from './event-calendar.controller';
import { EventCalendar, EventCalendarSchema } from './event-calendar.schema';
import { EventCalendarService } from './event-calendar.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(EventCalendar.name, EventCalendarSchema),
]);

@Module({
  imports: [mongooseModule, WebSocketModule],
  controllers: [EventCalendarController],
  providers: [EventCalendarService],
})
export class EventCalendarModule {}
