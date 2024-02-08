import { IsArray, IsNumber, IsString } from 'class-validator';

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
  date?: string;

  @IsString()
  startHour?: string;

  @IsString()
  finishHour?: string;

  @IsArray()
  gameplays?: number[];
}

export class TableResponse {
  @IsString()
  name: string;

  @IsString()
  startHour: string;

  @IsString()
  finishHour: string;

  @IsString()
  date: string;
}
export class CloseAllDto {
  @IsArray()
  ids: number[];

  @IsString()
  finishHour: string;
}
