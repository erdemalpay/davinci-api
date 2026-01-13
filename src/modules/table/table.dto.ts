import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class TableDto {
  @IsOptional()
  @IsNumber()
  _id?: number;

  @IsOptional()
  @IsNumber()
  location?: number;

  @IsOptional()
  @IsNumber()
  playerCount?: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  startHour?: string;

  @IsOptional()
  @IsString()
  finishHour?: string;

  @IsOptional()
  @IsArray()
  gameplays?: number[];

  @IsOptional()
  @IsArray()
  orders?: number[];

  @IsOptional()
  @IsArray()
  tables?: string[];

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsBoolean()
  isOnlineSale?: boolean;

  @IsBoolean()
  isAutoEntryAdded: boolean;
}

export class TableResponse {
  @IsString()
  name: string;

  @IsString()
  startHour: string;

  @IsString()
  type?: string;

  @IsString()
  finishHour: string;

  @IsString()
  date: string;

  @IsString()
  createdBy: string;
}
export class CloseAllDto {
  @IsArray()
  ids: number[];

  @IsString()
  finishHour: string;
}
export class AggregatedPlayerCountResponse {
  @IsString()
  date: string;

  @IsObject()
  countsByLocation: { [key: string]: number };
}
export class CreateFeedbackDto {
  location: number;
  tableName: string;
  starRating?: number;
  comment?: string;
}

export enum TableStatus {
  CANCELLED = 'cancelled',
}
export enum TableTypes {
  NORMAL = 'normal',
  TAKEOUT = 'takeout',
  ONLINE = 'online',
  ACTIVITY = 'activity',
}
