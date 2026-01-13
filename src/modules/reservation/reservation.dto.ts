import { IsNumber, IsOptional, IsString } from 'class-validator';

export class ReservationDto {
  @IsOptional()
  @IsNumber()
  _id?: number;

  @IsOptional()
  @IsNumber()
  location?: number;

  @IsOptional()
  @IsNumber()
  playerCount?: number;

  @IsString()
  name: string;

  @IsString()
  phone: string;

  @IsString()
  @IsOptional()
  createdBy?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  reservationHour?: string;

  @IsOptional()
  @IsString()
  reservedTable?: string;

  @IsOptional()
  @IsString()
  callHour?: string;

  @IsOptional()
  @IsString()
  approvedHour?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
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
