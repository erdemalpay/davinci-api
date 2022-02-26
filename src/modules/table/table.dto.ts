import { IsNumber, IsString, MaxLength, MinLength } from 'class-validator';

export class TableDto {
  @IsNumber()
  location: number;

  @IsNumber()
  playerCount: number;

  @IsString()
  name: string;

  @IsString()
  date: string;

  @IsString()
  startHour: string;

  @IsString()
  finishHour: string;
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
