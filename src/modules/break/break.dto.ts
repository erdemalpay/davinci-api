import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

// Why someone is unavailable. A break is one of them; all of them keep the
// person out of call assignment.
export enum BreakTypeEnum {
  BREAK = 'BREAK',
  RECOMMENDING_GAME = 'RECOMMENDING_GAME',
  PREPARING_ORDER = 'PREPARING_ORDER',
  TAKING_PAYMENT = 'TAKING_PAYMENT',
  OTHER = 'OTHER',
}

export class CreateBreakDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  user: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  location: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsDateString()
  date: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  startHour?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  finishHour?: string;

  // Defaults to BREAK.
  @ApiProperty({ required: false, enum: BreakTypeEnum })
  @IsOptional()
  @IsEnum(BreakTypeEnum)
  type?: BreakTypeEnum;

  // Required for OTHER.
  @ApiProperty({ required: false })
  @ValidateIf((dto) => dto.type === BreakTypeEnum.OTHER)
  @IsNotEmpty()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class UpdateBreakDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  user?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  location?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  startHour?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  finishHour?: string;
}

export class BreakQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  user?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  location?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  after?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  before?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  limit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  asc?: number | '1' | '0' | '-1';
}
