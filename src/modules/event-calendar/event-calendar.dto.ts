import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class EventCalendarItemDto {
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  badge: string[];

  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color must be #RRGGBB' })
  color: string;

  @IsString()
  @MaxLength(60)
  title: string;

  @IsString()
  @MaxLength(160)
  description: string;

  // Hazır ikon anahtarı ya da herkese açık sayfada güvenli olması için sadece https görsel
  @IsString()
  @Matches(/^$|^[a-z0-9-]+$|^https:\/\//, {
    message: 'icon must be a preset key or an https url',
  })
  icon: string;
}

export class CreateEventCalendarDto {
  @IsString()
  @MaxLength(60)
  title: string;

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => EventCalendarItemDto)
  items: EventCalendarItemDto[];

  @IsOptional()
  @IsBoolean()
  hasQr?: boolean;
}

export class UpdateEventCalendarDto extends PartialType(
  CreateEventCalendarDto,
) {}
