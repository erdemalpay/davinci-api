import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateButtonCallDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  readonly tableName: string;

  @ApiProperty()
  @IsString()
  readonly type: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  readonly location: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  readonly hour: string;
}
export enum ButtonCallTypeEnum {
  TABLECALL = 'TABLECALL',
  GAMEMASTERCALL = 'GAMEMASTERCALL',
  ORDERCALL = 'ORDERCALL',
}
