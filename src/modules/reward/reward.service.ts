import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Reward } from './reward.schema';
import { CreateRewardDto, RewardDto } from './reward.dto';

export class RewardService {
  constructor(@InjectModel(Reward.name) private rewardModel: Model<Reward>) {}

  findAll() {
    return this.rewardModel.find();
  }

  create(createRewardDto: CreateRewardDto) {
    return this.rewardModel.create(createRewardDto);
  }

  async update(id: number, rewardDto: RewardDto) {
    return this.rewardModel.findByIdAndUpdate(id, rewardDto, {
      new: true,
    });
  }

  remove(id: number) {
    return this.rewardModel.findByIdAndRemove(id);
  }
}
