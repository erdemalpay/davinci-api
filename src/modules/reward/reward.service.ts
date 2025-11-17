import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User } from '../user/user.schema';
import { CreateRewardDto, RewardDto } from './reward.dto';
import { Reward } from './reward.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
export class RewardService {
  constructor(
    @InjectModel(Reward.name) private rewardModel: Model<Reward>,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  findAll() {
    return this.rewardModel.find();
  }

  async create(user: User, createRewardDto: CreateRewardDto) {
    const reward = await this.rewardModel.create(createRewardDto);
    this.websocketGateway.emitRewardChanged(user, reward);
    return reward;
  }

  async update(user: User, id: number, rewardDto: RewardDto) {
    const reward = await this.rewardModel.findByIdAndUpdate(id, rewardDto, {
      new: true,
    });
    this.websocketGateway.emitRewardChanged(user, reward);
    return reward;
  }

  async remove(user: User, id: number) {
    const reward = await this.rewardModel.findByIdAndRemove(id);
    this.websocketGateway.emitRewardChanged(user, reward);
    return reward;
  }
}
