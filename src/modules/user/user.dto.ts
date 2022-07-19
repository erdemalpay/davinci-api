import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @IsString()
  @ApiProperty()
  _id: string;

  @IsString()
  @ApiProperty()
  name: string;

  @IsString()
  password: string;

  @IsString()
  @ApiProperty()
  @IsOptional()
  role?: string;

  @ApiProperty()
  active: boolean;
}

export class UserResponse {
  @ApiProperty()
  name: string;

  @ApiProperty()
  active: boolean;

  @ApiProperty()
  role: string;

  @ApiProperty()
  _id: number;
}
