import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { WebSocketModule } from '../websocket/websocket.module';
import { ConsumerController } from './consumer.controller';
import { Consumer, ConsumerSchema } from './consumer.schema';
import { ConsumerService } from './consumer.service';

@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      createAutoIncrementConfig(Consumer.name, ConsumerSchema),
    ]),
    WebSocketModule,
  ],
  controllers: [ConsumerController],
  providers: [ConsumerService],
  exports: [ConsumerService],
})
export class ConsumerModule {}
