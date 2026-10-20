import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
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

  // Explanation (default) or a question about the game.
  @ApiProperty({ required: false, enum: GmCallReasonEnum })
  @IsOptional()
  @IsEnum(GmCallReasonEnum)
  readonly gmCallReason?: GmCallReasonEnum;
}

export class ChangeGmCallRequestDto {
  // Identify the table so a call id alone can't change someone else's call.
  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  readonly location: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  readonly tableName: string;

  @ApiProperty({ enum: GmCallReasonEnum })
  @IsEnum(GmCallReasonEnum)
  readonly gmCallReason: GmCallReasonEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  readonly game?: number;
}

export enum DeclineReasonEnum {
  BREAK = 'BREAK',
  TAKING_PAYMENT = 'TAKING_PAYMENT',
  RECOMMENDING_GAME = 'RECOMMENDING_GAME',
  PREPARING_ORDER = 'PREPARING_ORDER',
  WC = 'WC',
  WAREHOUSE = 'WAREHOUSE',
  BAR_CLEANING = 'BAR_CLEANING',
  DOESNT_KNOW_GAME = 'DOESNT_KNOW_GAME',
  OTHER = 'OTHER',
  // Set by the system: the assignee started explaining a game at another
  // table, so the call went to someone else.
  STARTED_EXPLAINING = 'STARTED_EXPLAINING',
}

export class DeclineButtonCallDto {
  @ApiProperty({ enum: DeclineReasonEnum })
  @IsEnum(DeclineReasonEnum)
  readonly reason: DeclineReasonEnum;

  // Required when the reason is OTHER.
  @ApiProperty({ required: false })
  @ValidateIf((dto) => dto.reason === DeclineReasonEnum.OTHER)
  @IsNotEmpty()
  @IsString()
  @MaxLength(300)
  readonly note?: string;

  // The game the game master doesn't know (DOESNT_KNOW_GAME), needed when
  // the call doesn't name a game yet.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  readonly game?: number;

  // Declining to go on a break after confirming the break warning.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  readonly breakWarningConfirmed?: boolean;
}

export class CallReportQueryDto {
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

// Calls handled by service staff: a table calling to order, and the bar
// calling for ready orders to be taken to the tables.
export const SERVICE_CALL_TYPES = [
  ButtonCallTypeEnum.ORDERCALL,
  ButtonCallTypeEnum.ORDERREADYCALL,
];

export const isServiceCallType = (type?: string) =>
  SERVICE_CALL_TYPES.includes(type as ButtonCallTypeEnum);

// Calls that are assigned to a person: game master calls and service calls.
export const ASSIGNED_CALL_TYPES = [
  ButtonCallTypeEnum.GAMEMASTERCALL,
  ...SERVICE_CALL_TYPES,
];

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

export class TakeUpstairsDutyDto {
  @ApiProperty()
  @IsNumber()
  readonly location: number;
}
