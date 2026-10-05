import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export enum GmCallReasonEnum {
  RECOMMENDATION = 'RECOMMENDATION',
  EXPLANATION = 'EXPLANATION',
  QUESTION = 'QUESTION',
}

export class CreateButtonCallDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  readonly tableName: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  readonly type: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  readonly location: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  readonly hour: string;

  @ApiProperty({ required: false, enum: GmCallReasonEnum })
  @IsOptional()
  @IsEnum(GmCallReasonEnum)
  readonly gmCallReason?: GmCallReasonEnum;

  // Game the table wants explained (GmCallReasonEnum.EXPLANATION).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  readonly game?: number;
}
export enum GameAvailabilityStatus {
  // Someone who knows the game is free right now.
  AVAILABLE = 'available',
  // Everyone in the cafe who knows the game is busy; the table can wait.
  BUSY = 'busy',
  // Someone who knows the game starts their shift later today.
  LATER = 'later',
  // Nobody who knows the game is in the cafe today.
  UNAVAILABLE = 'unavailable',
}

export class CheckGameAvailabilityDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  readonly location: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  readonly tableName: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  readonly game: number;
}

export class UnmetExplanationRequestQueryDto {
  @IsOptional()
  @IsNumber()
  location?: number;

  @IsOptional()
  @IsString()
  after?: string;

  @IsOptional()
  @IsString()
  before?: string;
}
export enum AssignmentActionEnum {
  ASSIGNED = 'assigned',
  DECLINED = 'declined',
  CLAIMED = 'claimed',
}
export enum ButtonCallTypeEnum {
  TABLECALL = 'TABLECALL',
  GAMEMASTERCALL = 'GAMEMASTERCALL',
  ORDERCALL = 'ORDERCALL',
  ORDERREADYCALL = 'ORDERREADYCALL',
}

export enum ButtonCallActionEnum {
  CREATE = 'create',
  RECALL = 'recall',
  CLOSE = 'close',
  ASSIGN = 'assign',
}

export class ButtonCallQueryDto {
  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsNumber()
  location?: number;

  @IsOptional()
  @IsString()
  tableName?: string;

  @IsOptional()
  @IsString()
  cancelledBy?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  after?: string;

  @IsOptional()
  @IsString()
  before?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  asc?: number | '1' | '0' | '-1';

  @IsOptional()
  @IsString()
  search?: string;
}
