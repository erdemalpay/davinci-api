import { IsNumber, IsString, MaxLength, MinLength } from 'class-validator';

export class TableDto {
  @IsNumber()
  @MinLength(4)
  @MaxLength(20)
  playerCount: number

  @IsString()
  @MinLength(4)
  @MaxLength(20)
  name: string;

  @IsString()
  @MinLength(4)
  @MaxLength(20)
  date: string;

  @IsString()
  @MinLength(4)
  @MaxLength(20)
  active: string;

  @IsString()
  @MinLength(4)
  @MaxLength(20)
  startHour: string;

  @IsString()
  @MinLength(4)
  @MaxLength(20)
  finishHour: string;
  
}
