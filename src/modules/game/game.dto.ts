import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class GameDto {
  @IsNumber()
  _id: number;

  @IsString()
  @ApiProperty()
  name: string;

  @IsString()
  image: string;

  @IsString()
  thumbnail: string;

  @ApiProperty()
  expansion: boolean;

  @IsNumber()
  narrationDurationPoint?: number;
}
