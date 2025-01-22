import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CloseButtonCallDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  readonly _id: number;

  @ApiProperty()
  @IsOptional()
  finishHour: string;
}
