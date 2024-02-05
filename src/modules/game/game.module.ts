import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameController } from './game.controller';
import { Game, GameSchema } from './game.schema';
import { GameService } from './game.service';

const mongooseModule = MongooseModule.forFeature([
  { name: Game.name, schema: GameSchema },
]);

@Module({
  imports: [mongooseModule],
  providers: [GameService],
  controllers: [GameController],
  exports: [mongooseModule, GameService, GameModule], // Export mongooseModule here
})
export class GameModule {}
