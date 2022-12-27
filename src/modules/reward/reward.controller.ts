import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RewardService } from './reward.service';
import { CreateRewardDto } from './reward.dto';
import { ApiResponse } from '@nestjs/swagger';
import { RewardDto, RewardResponse } from './reward.dto';

@Controller('/rewards')
export class RewardController {
  constructor(private readonly rewardService: RewardService) {}

  @Get()
  getRewards() {
    return this.rewardService.findAll();
  }

  @Post()
  createReward(@Body() createRewardDto: CreateRewardDto) {
    return this.rewardService.create(createRewardDto);
  }

  @Patch('/:id')
  @ApiResponse({ type: RewardResponse })
  updateReward(@Param('id') id: number, @Body() rewardDto: RewardDto) {
    return this.rewardService.update(id, rewardDto);
  }

  @Delete('/:id')
  @ApiResponse({ type: RewardResponse })
  deleteReward(@Param('id') id: number) {
    return this.rewardService.remove(id);
  }
}
