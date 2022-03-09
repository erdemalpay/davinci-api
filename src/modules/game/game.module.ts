import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { Game, GameSchema } from './game.schema';

const mongooseModule = MongooseModule.forFeature([
  { name: Game.name, schema: GameSchema },
]);

@Module({
  imports: [mongooseModule],
  providers: [GameService],
  exports: [GameService],
  controllers: [GameController],
})
export class GameModule {}
