import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export enum AnomalyType {
  // Money
  CANCELLED_AFTER_PAYMENT = 'CANCELLED_AFTER_PAYMENT',
  DISCOUNTED_AFTER_PAYMENT = 'DISCOUNTED_AFTER_PAYMENT',
  PAYMENT_CANCELLED_AFTER_CLOSING = 'PAYMENT_CANCELLED_AFTER_CLOSING',
  NEGATIVE_COLLECTION = 'NEGATIVE_COLLECTION',
  CLOSED_TABLE_UNPAID = 'CLOSED_TABLE_UNPAID',
  UNUSUAL_DISCOUNTS = 'UNUSUAL_DISCOUNTS',
  UNUSUAL_CANCELLATIONS = 'UNUSUAL_CANCELLATIONS',
  // Tables
  TABLE_LEFT_OPEN = 'TABLE_LEFT_OPEN',
  LONG_OPEN_TABLE = 'LONG_OPEN_TABLE',
  TABLE_WITHOUT_ORDERS = 'TABLE_WITHOUT_ORDERS',
  DUPLICATE_OPEN_TABLE = 'DUPLICATE_OPEN_TABLE',
  TABLE_REOPENED = 'TABLE_REOPENED',
  TABLE_DELETED = 'TABLE_DELETED',
  // Staff
  NO_SHOW = 'NO_SHOW',
  UNPLANNED_CHECK_IN = 'UNPLANNED_CHECK_IN',
  NOT_CHECKED_OUT = 'NOT_CHECKED_OUT',
  LATE_CHECK_OUT = 'LATE_CHECK_OUT',
  LONG_BREAK = 'LONG_BREAK',
  MANY_BREAKS = 'MANY_BREAKS',
  CONCURRENT_BREAKS = 'CONCURRENT_BREAKS',
  VISIT_DELETED = 'VISIT_DELETED',
  // Calls and games
  LONG_WAITING_CALL = 'LONG_WAITING_CALL',
  MANY_DECLINES = 'MANY_DECLINES',
  EXPLAINED_UNLEARNED_GAME = 'EXPLAINED_UNLEARNED_GAME',
  NO_MIDDLEMAN = 'NO_MIDDLEMAN',
  MIDDLEMAN_FLAPPING = 'MIDDLEMAN_FLAPPING',
  // Stock
  NEGATIVE_STOCK = 'NEGATIVE_STOCK',
  LARGE_STOCK_EQUALIZE = 'LARGE_STOCK_EQUALIZE',
  UNUSUAL_WASTE = 'UNUSUAL_WASTE',
}

export enum AnomalySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export class RunAnomaliesDto {
  @IsString()
  date: string;
}

export class UpdateAnomalyDto {
  @IsOptional()
  @IsBoolean()
  reviewed?: boolean;

  @IsOptional()
  @IsString()
  reviewNote?: string;
}

export class AnomalyQueryDto {
  @IsOptional()
  @IsString()
  after?: string;

  @IsOptional()
  @IsString()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  location?: number;
}
