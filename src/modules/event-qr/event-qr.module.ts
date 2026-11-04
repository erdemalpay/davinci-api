import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventQrController } from './event-qr.controller';
import { EventQr, EventQrSchema } from './event-qr.schema';
import { EventQrService } from './event-qr.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: EventQr.name, schema: EventQrSchema }]),
  ],
  controllers: [EventQrController],
  providers: [EventQrService],
})
export class EventQrModule {}
