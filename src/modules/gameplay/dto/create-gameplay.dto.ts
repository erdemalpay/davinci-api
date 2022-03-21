import { IsNumber, IsString } from 'class-validator';

export class CreateGameplayDto {
  @IsNumber()
  location: number;

  @IsNumber()
  playerCount: number;

  @IsString()
  mentor: string;

  @IsString()
  date: string;

  @IsString()
  startHour: string;

  @IsString()
  finishHour: string;

  @IsNumber()
  game: number;
}
