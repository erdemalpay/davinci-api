import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

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

  @IsBoolean()
  @ApiProperty()
  expansion: boolean;

  @IsOptional()
  @IsNumber()
  narrationDurationPoint?: number;
}
