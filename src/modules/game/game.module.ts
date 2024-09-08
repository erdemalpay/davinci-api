import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameController } from './game.controller';
import { GameGateway } from './game.gateway';
import { Game, GameSchema } from './game.schema';
import { GameService } from './game.service';

const mongooseModule = MongooseModule.forFeature([
  { name: Game.name, schema: GameSchema },
]);

@Module({
  imports: [mongooseModule],
  providers: [GameService, GameGateway],
  controllers: [GameController],
  exports: [mongooseModule, GameService, GameModule, GameGateway], // Export mongooseModule here
})
export class GameModule {}
