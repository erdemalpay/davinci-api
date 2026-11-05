import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateEventQrDto {
  @IsString()
  title: string;

  // Panelden girilen linkin herkese açık sayfada güvenli olması için sadece https
  @IsString()
  @Matches(/^$|^https:\/\//, { message: 'url must start with https://' })
  url: string;

  @IsOptional()
  @IsString()
  @Matches(/^$|^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format or empty',
  })
  date?: string;
}

export class UpdateEventQrDto extends PartialType(CreateEventQrDto) {}
