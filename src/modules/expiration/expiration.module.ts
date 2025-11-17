import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExpirationController } from './expiration.controller';
import { ExpirationService } from './expiration.service';
import {
  ExpirationCount,
  ExpirationCountSchema,
} from './expirationCount.schema';
import { ExpirationList, ExpirationListSchema } from './expirationList.schema';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  { name: ExpirationList.name, useFactory: () => ExpirationListSchema },
  { name: ExpirationCount.name, useFactory: () => ExpirationCountSchema },
]);

@Module({
  imports: [
    WebSocketModule,mongooseModule],
  providers: [ExpirationService],
  exports: [ExpirationService],
  controllers: [ExpirationController],
})
export class ExpirationModule {}
