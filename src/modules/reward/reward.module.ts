import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { RewardController } from './reward.controller';
import { Reward, RewardSchema } from './reward.schema';
import { RewardService } from './reward.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Reward.name, RewardSchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [RewardService],
  exports: [RewardService],
  controllers: [RewardController],
})
export class RewardModule {}
