import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { TriggerType } from './customer-popup.schema';

export class CreateCustomerPopupDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsBoolean()
  isActive: boolean;

  @IsEnum(TriggerType)
  triggerType: TriggerType;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  periodicDays?: number[];

  @IsOptional()
  @IsString()
  @Matches(/^$|^(0[1-9]|[12]\d|3[01])-(0[1-9]|1[0-2])$/, {
    message: 'specialDate must be in DD-MM format (e.g. 14-02) or empty',
  })
  specialDate?: string;

  @IsOptional()
  @IsNumber()
  cooldownHours?: number;

  @IsArray()
  @IsNumber({}, { each: true })
  locations: number[];
}
