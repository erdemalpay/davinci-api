import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateButtonCallDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  readonly tableName: string;

  // @ApiProperty()
  // @IsNotEmpty()
  // @IsString()
  // readonly type: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  readonly location: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  readonly hour: string;
}
