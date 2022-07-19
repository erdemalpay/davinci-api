import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OldGameService } from './game.service';
import { Game, OldGameSchema } from './game.schema';

const mongooseModule = MongooseModule.forFeature(
  [{ name: Game.name, schema: OldGameSchema }],
  'olddb',
);

@Module({
  imports: [mongooseModule],
  providers: [OldGameService],
  exports: [OldGameService],
})
export class OldGameModule {}
