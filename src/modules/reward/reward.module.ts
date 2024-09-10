import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { RewardController } from './reward.controller';
import { RewardGateway } from './reward.gateway';
import { Reward, RewardSchema } from './reward.schema';
import { RewardService } from './reward.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Reward.name, RewardSchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [RewardService, RewardGateway],
  exports: [RewardService, RewardGateway],
  controllers: [RewardController],
})
export class RewardModule {}
