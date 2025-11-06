import { IsNumber, IsString } from 'class-validator';

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
  createdBy: string;

  @IsString()
  date?: string;

  @IsString()
  note?: string;

  @IsString()
  reservationHour?: string;

  @IsString()
  reservedTable?: string;

  @IsString()
  callHour?: string;

  @IsString()
  approvedHour?: string;

  @IsString()
  status?: string;

  @IsNumber()
  comingDurationInMinutes?: number;
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
