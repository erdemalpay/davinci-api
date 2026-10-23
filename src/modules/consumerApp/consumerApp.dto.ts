import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RegisterConsumerDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  surname: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(30)
  userName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class LoginConsumerDto {
  // Email or user name.
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  identity: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  password: string;
}

// What the table's QR code carries.
export class CheckInDto {
  @ApiProperty()
  @IsNumber()
  location: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  tableName: string;
}

export class GameplayResultPlayerDto {
  // Empty for a guest without the app.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  consumer?: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  score?: number;

  @ApiProperty()
  @IsBoolean()
  isWinner: boolean;
}

export class SaveGameplayResultDto {
  @ApiProperty()
  @IsNumber()
  gameplay: number;

  @ApiProperty({ type: [GameplayResultPlayerDto] })
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GameplayResultPlayerDto)
  players: GameplayResultPlayerDto[];
}
