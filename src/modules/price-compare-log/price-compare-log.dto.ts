import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  PriceCompareLogStatus,
  PriceCompareLogType,
} from './price-compare-log.schema';

export class GetPriceCompareLogsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @IsEnum(PriceCompareLogType)
  type?: PriceCompareLogType;

  @IsOptional()
  @IsEnum(PriceCompareLogStatus)
  status?: PriceCompareLogStatus;

  @IsOptional()
  @IsString()
  target?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
