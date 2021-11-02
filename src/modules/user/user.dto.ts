import {  IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  @ApiProperty()
  username: string;

  @IsString()
  @MaxLength(20)
  @ApiProperty()
  name: string;

  @IsString()
  @MinLength(4)
  @MaxLength(20)
  @ApiProperty()
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
  id: number;
}
