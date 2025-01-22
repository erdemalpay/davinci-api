import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty, IsOptional } from 'class-validator';
import { Types } from 'mongoose';

export class CloseButtonCallDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsMongoId()
  readonly _id: Types.ObjectId;

  @ApiProperty()
  @IsOptional()
  finishHour: string;
}
