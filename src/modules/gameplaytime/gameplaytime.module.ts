import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { WebSocketModule } from '../websocket/websocket.module';
import { GameplayTimeController } from './gameplaytime.controller';
import { GameplayTime, GameplayTimeSchema } from './gameplaytime.schema';
import { GameplayTimeService } from './gameplaytime.service';

@Module({
  imports: [
    MongooseModule.forFeatureAsync([
      createAutoIncrementConfig(GameplayTime.name, GameplayTimeSchema),
    ]),
    WebSocketModule,
  ],
  controllers: [GameplayTimeController],
  providers: [GameplayTimeService],
  exports: [GameplayTimeService],
})
export class GameplayTimeModule {}
