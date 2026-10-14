import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class StaffPerformanceQueryDto {
  @Matches(DAY)
  after: string;

  @Matches(DAY)
  before: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  location?: number;
}

export type StaffDailyCountField =
  | 'ordersCreated'
  | 'ordersPrepared'
  | 'ordersDelivered'
  | 'collections'
  | 'gameplaysCreated'
  | 'gameplaysMentored'
  // The narration points of the games explained.
  | 'gameplaysMentoredPoints';

// What one person did on one cafe day.
export type StaffDailyCounts = {
  user: string;
  date: string;
} & Record<StaffDailyCountField, number>;
