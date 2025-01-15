import { IsNumber, IsString } from 'class-validator';

export class GameplayDto {
  @IsNumber()
  location: number;

  @IsNumber()
  playerCount: number;

  @IsString()
  mentor: string;

  @IsString()
  createdBy: string;

  @IsString()
  date: string;

  @IsString()
  startHour: string;

  @IsString()
  finishHour: string;

  @IsNumber()
  game: number;
}
