import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

export type FieldGrouping = 'mentor' | 'game';

export class GameplayQueryDto {
  @IsNumber()
  location: number;

  @IsOptional()
  @IsString()
  field?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  game?: number;

  @IsOptional()
  @IsString()
  mentor?: string;

  @IsOptional()
  @IsArray()
  groupBy?: FieldGrouping[];

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsNumber()
  asc?: number;

  @IsOptional()
  @IsString()
  search?: string;
}
export class GameplayQueryGroupDto {
  @IsString()
  location: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  groupBy?: FieldGrouping[];
}
