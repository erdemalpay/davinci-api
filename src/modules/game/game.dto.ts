import { IsString, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}
