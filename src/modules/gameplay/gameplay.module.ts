import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ActivityModule } from '../activity/activity.module';
import { Game, GameSchema } from '../game/game.schema';
import { User, UserSchema } from '../user/user.schema';
import { GameplayController } from './gameplay.controller';
import { Gameplay, GameplaySchema } from './gameplay.schema';
import { GameplayService } from './gameplay.service';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Gameplay.name, GameplaySchema),
  { name: Game.name, useFactory: () => GameSchema },
  { name: User.name, useFactory: () => UserSchema },
]);

@Module({
  imports: [
    WebSocketModule,
    mongooseModule,
    ActivityModule,
  ],
  providers: [GameplayService],
  exports: [GameplayService],
  controllers: [GameplayController],
})
export class GameplayModule {}
