import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { EventStatus } from '../schemas/event.schema';

export class CreateEventDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  stand?: string;

  @IsString()
  rewardLabel: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  codeValidityDays?: number;
}

export class UpdateEventStatusDto {
  @IsEnum(EventStatus)
  status: EventStatus;
}

export class EventQueryDto {
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
