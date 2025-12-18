import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { RolePermissionEnum } from './user.enums';
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

export class CreateRoleDto {
  @IsString()
  @ApiProperty()
  name: string;

  @IsString()
  @ApiProperty()
  color: string;

  @IsArray()
  @IsEnum(RolePermissionEnum, { each: true })
  @ApiProperty({
    enum: RolePermissionEnum,
    isArray: true,
    example: [RolePermissionEnum.MANAGEMENT, RolePermissionEnum.OPERATION],
  })
  permissions: RolePermissionEnum[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  name?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  color?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(RolePermissionEnum, { each: true })
  @ApiProperty({
    enum: RolePermissionEnum,
    isArray: true,
    required: false,
    example: [RolePermissionEnum.MANAGEMENT, RolePermissionEnum.OPERATION],
  })
  permissions?: RolePermissionEnum[];
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
