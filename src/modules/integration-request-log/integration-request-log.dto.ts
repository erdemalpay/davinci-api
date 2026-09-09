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
  IntegrationRequestStatus,
  IntegrationSource,
} from './integration-request-log.schema';

export class GetIntegrationRequestLogsQueryDto {
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
  @IsEnum(IntegrationSource)
  source?: IntegrationSource;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsEnum(IntegrationRequestStatus)
  status?: IntegrationRequestStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
