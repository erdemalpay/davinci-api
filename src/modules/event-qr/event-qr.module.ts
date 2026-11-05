import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { WebSocketModule } from '../websocket/websocket.module';
import { EventQrController } from './event-qr.controller';
import { EventQr, EventQrSchema } from './event-qr.schema';
import { EventQrService } from './event-qr.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(EventQr.name, EventQrSchema),
]);

@Module({
  imports: [mongooseModule, WebSocketModule],
  controllers: [EventQrController],
  providers: [EventQrService],
})
export class EventQrModule {}
