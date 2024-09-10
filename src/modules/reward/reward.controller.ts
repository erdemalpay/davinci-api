import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { CreateRewardDto, RewardDto, RewardResponse } from './reward.dto';
import { RewardService } from './reward.service';
@Controller('/rewards')
export class RewardController {
  constructor(private readonly rewardService: RewardService) {}

  @Get()
  getRewards() {
    return this.rewardService.findAll();
  }

  @Post()
  createReward(
    @ReqUser() user: User,
    @Body() createRewardDto: CreateRewardDto,
  ) {
    return this.rewardService.create(user, createRewardDto);
  }

  @Patch('/:id')
  @ApiResponse({ type: RewardResponse })
  updateReward(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() rewardDto: RewardDto,
  ) {
    return this.rewardService.update(user, id, rewardDto);
  }

  @Delete('/:id')
  @ApiResponse({ type: RewardResponse })
  deleteReward(@ReqUser() user: User, @Param('id') id: number) {
    return this.rewardService.remove(user, id);
  }
}
