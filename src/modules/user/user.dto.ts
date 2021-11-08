import {  IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  username: string;

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

export class UserResponse {
  @ApiProperty()
  username: string;
  
  @ApiProperty()
  name: string;

  @ApiProperty()
  password: string;

  @ApiProperty()
  active: boolean;
  
  @ApiProperty()
  role: string;

  @ApiProperty()
  id: number;
}
