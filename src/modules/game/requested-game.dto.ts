import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RequestGameDto {
  @IsString()
  @MinLength(2)
  @ApiProperty()
  name: string;

  @IsEmail()
  @ApiProperty()
  email: string;
}
