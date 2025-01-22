import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateButtonCallDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  readonly tableName: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  readonly location: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  readonly date: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  readonly startHour: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  readonly createdBy: string;
}
