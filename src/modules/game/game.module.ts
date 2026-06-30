import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BackInStockModule } from '../back-in-stock/back-in-stock.module';
import { Gameplay, GameplaySchema } from '../gameplay/gameplay.schema';
import { RedisModule } from '../redis/redis.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { BggGameSchema } from './bgg-game.schema';
import { GameController } from './game.controller';
import { Game, GameSchema } from './game.schema';
import { GameService } from './game.service';
import { RequestedGame, RequestedGameSchema } from './requested-game.schema';

const mongooseModule = MongooseModule.forFeature([
  { name: Game.name, schema: GameSchema },
  { name: Gameplay.name, schema: GameplaySchema },
  { name: 'BggGame', schema: BggGameSchema },
  { name: RequestedGame.name, schema: RequestedGameSchema },
]);

@Module({
  imports: [
    WebSocketModule,
    RedisModule,
    mongooseModule,
    forwardRef(() => BackInStockModule),
  ],
  providers: [GameService],
  controllers: [GameController],
  exports: [mongooseModule, GameService],
})
export class GameModule {}
