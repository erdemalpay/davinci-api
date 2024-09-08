import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ActivityModule } from '../activity/activity.module';
import { GameplayController } from './gameplay.controller';
import { GameplayGateway } from './gameplay.gateway';
import { Gameplay, GameplaySchema } from './gameplay.schema';
import { GameplayService } from './gameplay.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Gameplay.name, GameplaySchema),
]);

@Module({
  imports: [mongooseModule, ActivityModule],
  providers: [GameplayService, GameplayGateway],
  exports: [GameplayService],
  controllers: [GameplayController],
})
export class GameplayModule {}
