import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString } from 'class-validator';
import { Role } from './user.role.schema';
import { UserSettings } from './user.schema';

export class CreateUserDto {
  @IsString()
  @ApiProperty()
  name: string;

  @IsString()
  _id: string;

  @IsString()
  fullName: string;

  @IsString()
  password: string;

  @IsBoolean()
  active: boolean;

  @IsString()
  imageUrl: string;
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

  @ApiProperty()
  imageUrl: string;

  @ApiProperty()
  phone: string;

  @ApiProperty()
  address: string;

  @ApiProperty()
  settings: UserSettings;
}
