import { IsEnum, IsOptional, IsString, IsNumber, Min, IsDateString } from 'class-validator';
import { WebhookSource, WebhookStatus } from './webhook-log.schema';

export class GetWebhookLogsQueryDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @IsEnum(WebhookSource)
  source?: WebhookSource;

  @IsOptional()
  @IsEnum(WebhookStatus)
  status?: WebhookStatus;

  @IsOptional()
  @IsString()
  endpoint?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
