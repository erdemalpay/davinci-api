import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CloseButtonCallDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  readonly tableName: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  readonly location: number;

  // Sent by older clients; the stored hour is the server's.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly hour?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  readonly type?: string;
}
