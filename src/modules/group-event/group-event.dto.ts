import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { GroupEventStatus, GroupEventType } from './group-event.schema';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-4]):[0-5]\d$/;

export class CreateGroupEventDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  organization: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  contactName: string;

  @IsString()
  @Matches(/^[0-9 +()-]{10,20}$/, { message: 'phone is not valid' })
  phone: string;

  @IsEmail()
  @MaxLength(120)
  email: string;

  @IsInt()
  @Min(1)
  @Max(100)
  participantCount: number;

  @Matches(DATE, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @Matches(TIME, { message: 'startTime must be HH:mm' })
  startTime: string;

  @Matches(TIME, { message: 'endTime must be HH:mm' })
  endTime: string;

  @IsEnum(GroupEventType)
  eventType: GroupEventType;

  @IsOptional()
  @IsBoolean()
  wantsGameMaster?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  gamePreferences?: string;

  @IsOptional()
  @IsBoolean()
  wantsFood?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  foodRequest?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  budgetPerPerson?: number;

  @IsOptional()
  @IsBoolean()
  needsInvoice?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  invoiceTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxOffice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // Honeypot: hidden on the form, so only bots fill it
  @IsOptional()
  @IsString()
  website?: string;
}

export class AvailabilityQueryDto {
  @IsOptional()
  @Matches(DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

export class GroupEventListQueryDto {
  @IsOptional()
  @IsEnum(GroupEventStatus)
  status?: GroupEventStatus;

  @IsOptional()
  @Matches(DATE)
  from?: string;

  @IsOptional()
  @Matches(DATE)
  to?: string;
}

export class UpdateGroupEventStatusDto {
  @IsEnum(GroupEventStatus)
  status: GroupEventStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  responseNote?: string;

  // Approve even when it goes over capacity (manager decided to fit them in)
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
