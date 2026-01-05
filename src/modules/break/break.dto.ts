import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

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
  @IsDateString()
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
  asc?: number | '1' | '0' | '-1';
}
