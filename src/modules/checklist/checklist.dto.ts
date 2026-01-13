import { IsArray, IsBoolean, IsDate, IsNumber, IsOptional, IsString } from 'class-validator';
import { CheckDuty } from './check.schema';
import { ChecklistDuty } from './checklist.schema';

export class CreateChecklistDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsArray()
  duties?: ChecklistDuty[];
}

export class CreateCheckDto {
  @IsString()
  name: string;

  @IsString()
  user: string;

  @IsNumber()
  location: number;

  @IsString()
  checklist: string;

  @IsArray()
  duties: CheckDuty[];

  @IsBoolean()
  isCompleted: boolean;

  @IsDate()
  createdAt: Date;
}
export class CheckQueryDto {
  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsOptional()
  @IsString()
  checklist?: string;

  @IsOptional()
  location?: number | string;

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
  @IsString()
  sort?: string;

  @IsOptional()
  asc?: number | '1' | '0' | '-1';

  @IsOptional()
  @IsString()
  search?: string;
}
