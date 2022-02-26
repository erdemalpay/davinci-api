import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GameListDto {
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  _id: string;

  @IsString()
  @MaxLength(20)
  @ApiProperty()
  name: string;

  @IsString()
  @MinLength(4)
  @MaxLength(20)
  password: string;

  @ApiProperty()
  active: boolean;
}
