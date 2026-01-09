import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateGameplayTimeDto {
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
  @IsNumber()
  table: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  gameplay: number;

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

export class UpdateGameplayTimeDto {
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
  @IsNumber()
  table?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  gameplay?: number;

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

export class GameplayTimeQueryDto {
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
  @IsNumber()
  table?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  gameplay?: number;

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
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  asc?: number | '1' | '0' | '-1';
}
