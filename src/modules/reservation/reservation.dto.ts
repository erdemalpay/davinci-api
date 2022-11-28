import { IsArray, IsNumber, IsString } from 'class-validator';

export class ReservationDto {
  @IsNumber()
  _id?: number;

  @IsNumber()
  location?: number;

  @IsNumber()
  playerCount?: number;

  @IsString()
  name: string;

  @IsString()
  phone: string;

  @IsString()
  date?: string;

  @IsString()
  reservationHour?: string;

  @IsString()
  callHour?: string;
}

export class ReservationResponse {
  @IsString()
  name: string;

  @IsString()
  startHour: string;

  @IsString()
  finishHour: string;

  @IsString()
  date: string;
}
