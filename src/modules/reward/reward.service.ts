import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { CreateRewardDto, RewardDto } from './reward.dto';
import { Reward } from './reward.schema';
export class RewardService {
  constructor(
    @InjectModel(Reward.name) private rewardModel: Model<Reward>,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  findAll() {
    return this.rewardModel.find();
  }

  async create(createRewardDto: CreateRewardDto) {
    const reward = await this.rewardModel.create(createRewardDto);
    this.websocketGateway.emitRewardChanged();
    return reward;
  }

  async update(id: number, rewardDto: RewardDto) {
    const reward = await this.rewardModel.findByIdAndUpdate(id, rewardDto, {
      new: true,
    });
    this.websocketGateway.emitRewardChanged();
    return reward;
  }

  async remove(id: number) {
    const reward = await this.rewardModel.findByIdAndRemove(id);
    this.websocketGateway.emitRewardChanged();
    return reward;
  }
}
