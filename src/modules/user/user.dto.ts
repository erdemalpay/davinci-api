import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from './user.role.schema';

export class CreateUserDto {
  @IsString()
  @ApiProperty()
  _id: string;

  @IsString()
  @ApiProperty()
  name: string;

  @IsString()
  password: string;

  @ApiProperty()
  active: boolean;
}

export class UserResponse {
  @ApiProperty()
  name: string;

  @ApiProperty()
  active: boolean;

  @ApiProperty()
  role: Role;

  @ApiProperty()
  _id: number;
}
