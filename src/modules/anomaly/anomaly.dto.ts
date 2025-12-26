import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsEnum } from 'class-validator';

export enum AnomalyType {
  RAPID_PAYMENTS = 'RAPID_PAYMENTS', // Aynı kişi kısa sürede birden fazla hesap aldı
  RAPID_GAME_EXPLANATIONS = 'RAPID_GAME_EXPLANATIONS', // Aynı kişi kısa sürede birden fazla oyun anlattı
}

export enum AnomalySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export class AnomalyQueryDto {
  @IsOptional()
  @IsString()
  user?: string;

  @IsOptional()
  @IsEnum(AnomalyType)
  type?: AnomalyType;

  @IsOptional()
  @IsEnum(AnomalySeverity)
  severity?: AnomalySeverity;

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
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;
}

export class AnomalyReportDto {
  @ApiProperty()
  date: string;

  @ApiProperty()
  totalAnomalies: number;

  @ApiProperty()
  anomaliesByType: Record<AnomalyType, number>;

  @ApiProperty()
  anomaliesBySeverity: Record<AnomalySeverity, number>;

  @ApiProperty()
  topUsers: Array<{
    userId: string;
    userName: string;
    anomalyCount: number;
  }>;
}

