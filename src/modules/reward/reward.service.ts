import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User } from '../user/user.schema';
import { CreateRewardDto, RewardDto } from './reward.dto';
import { RewardGateway } from './reward.gateway';
import { Reward } from './reward.schema';
export class RewardService {
  constructor(
    @InjectModel(Reward.name) private rewardModel: Model<Reward>,
    private readonly rewardGateway: RewardGateway,
  ) {}

  findAll() {
    return this.rewardModel.find();
  }

  async create(user: User, createRewardDto: CreateRewardDto) {
    const reward = await this.rewardModel.create(createRewardDto);
    this.rewardGateway.emitRewardChanged(user, reward);
    return reward;
  }

  async update(user: User, id: number, rewardDto: RewardDto) {
    const reward = await this.rewardModel.findByIdAndUpdate(id, rewardDto, {
      new: true,
    });
    this.rewardGateway.emitRewardChanged(user, reward);
    return reward;
  }

  async remove(user: User, id: number) {
    const reward = await this.rewardModel.findByIdAndRemove(id);
    this.rewardGateway.emitRewardChanged(user, reward);
    return reward;
  }
}
