import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { GameplayModule } from '../gameplay/gameplay.module';
import { LocationModule } from '../location/location.module';
import { TableModule } from '../table/table.module';
import { UserModule } from '../user/user.module';
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
    LocationModule,
    UserModule,
    GameplayModule,
    forwardRef(() => TableModule),
  ],
  controllers: [GameplayTimeController],
  providers: [GameplayTimeService],
  exports: [GameplayTimeService],
})
export class GameplayTimeModule {}
