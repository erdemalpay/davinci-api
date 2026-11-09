import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { WebSocketModule } from '../websocket/websocket.module';
import { GiftTrackingController } from './giftTracking.controller';
import {
  Gift,
  GiftRecipient,
  GiftRecipientSchema,
  GiftSchema,
  GiftTag,
  GiftTagSchema,
} from './giftTracking.schema';
import { GiftTrackingService } from './giftTracking.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(GiftTag.name, GiftTagSchema),
  createAutoIncrementConfig(GiftRecipient.name, GiftRecipientSchema),
  createAutoIncrementConfig(Gift.name, GiftSchema),
]);

@Module({
  imports: [WebSocketModule, mongooseModule],
  controllers: [GiftTrackingController],
  providers: [GiftTrackingService],
})
export class GiftTrackingModule {}
