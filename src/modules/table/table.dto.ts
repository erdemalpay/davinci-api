import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsString,
} from 'class-validator';

export class TableDto {
  @IsNumber()
  _id?: number;

  @IsNumber()
  location?: number;

  @IsNumber()
  playerCount?: number;

  @IsString()
  name?: string;

  @IsString()
  type?: string;

  @IsString()
  date?: string;

  @IsString()
  startHour?: string;

  @IsString()
  finishHour?: string;

  @IsArray()
  gameplays?: number[];

  @IsArray()
  orders?: number[];

  @IsArray()
  tables?: string[];

  @IsString()
  status?: string;

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
  table: number;
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
