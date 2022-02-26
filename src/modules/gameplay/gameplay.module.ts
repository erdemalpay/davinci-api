import { Module } from '@nestjs/common';
import { GameplayService } from './gameplay.service';
import { GameplayController } from './gameplay.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Gameplay, GameplaySchema } from './gameplay.schema';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Gameplay.name, GameplaySchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [GameplayService],
  exports: [GameplayService],
  controllers: [GameplayController],
})
export class GameplayModule {}
