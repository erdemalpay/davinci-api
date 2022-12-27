import { IsString } from 'class-validator';

export class CreateRewardDto {
  name: string;
  startDate: string;
  endDate: string;
}

export class RewardDto {
  name?: string;
  startDate?: string;
  endDate?: string;
}

export class RewardResponse {
  @IsString()
  name: string;

  @IsString()
  startDate: string;

  @IsString()
  endDate: string;
}
