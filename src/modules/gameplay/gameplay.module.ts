import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ActivityModule } from '../activity/activity.module';
import { GameplayController } from './gameplay.controller';
import { Gameplay, GameplaySchema } from './gameplay.schema';
import { GameplayService } from './gameplay.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Gameplay.name, GameplaySchema),
]);

@Module({
  imports: [mongooseModule, ActivityModule],
  providers: [GameplayService],
  exports: [GameplayService],
  controllers: [GameplayController],
})
export class GameplayModule {}
