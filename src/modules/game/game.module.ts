import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RedisModule } from '../redis/redis.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { BggGameSchema } from './bgg-game.schema';
import { GameController } from './game.controller';
import { Game, GameSchema } from './game.schema';
import { GameService } from './game.service';
import { RequestedGame, RequestedGameSchema } from './requested-game.schema';

const mongooseModule = MongooseModule.forFeature([
  { name: Game.name, schema: GameSchema },
  { name: 'BggGame', schema: BggGameSchema },
  { name: RequestedGame.name, schema: RequestedGameSchema },
]);

@Module({
  imports: [WebSocketModule, RedisModule, mongooseModule],
  providers: [GameService],
  controllers: [GameController],
  exports: [mongooseModule, GameService, GameModule], // Export mongooseModule here
})
export class GameModule {}
