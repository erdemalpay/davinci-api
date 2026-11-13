import { ValidationPipe } from '@nestjs/common';
import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const GIFT_SHARE_STATUSES = ['WAITING', 'SHARED', 'NOT_SHARED'];
const GIFT_TYPES = ['GIFT', 'LOAN', 'RAFFLE'];

export class CreateGiftTagDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  backgroundColor?: string;
}

export class CreateGiftRecipientDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsArray()
  tags?: number[];

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  // Panelde link olarak açıldığı için sadece https
  @IsOptional()
  @IsString()
  @Matches(/^$|^https:\/\//, {
    message: 'instagramUrl must start with https://',
  })
  instagramUrl?: string;

  @IsOptional()
  @IsNumber()
  instagramFollowers?: number;

  @IsOptional()
  @IsNumber()
  youtubeFollowers?: number;

  @IsOptional()
  @IsBoolean()
  isBlacklisted?: boolean;
}

export class UpdateGiftRecipientDto extends PartialType(
  CreateGiftRecipientDto,
) {}

export class GiftItemDto {
  @IsString()
  product: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateGiftDto {
  @IsInt()
  recipient: number;

  @IsDateString()
  date: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => GiftItemDto)
  items: GiftItemDto[];

  @IsOptional()
  @IsIn(GIFT_TYPES)
  type?: string;

  @ValidateIf((dto) => !!dto.shareStatus)
  @IsIn(GIFT_SHARE_STATUSES)
  shareStatus?: string;

  @IsOptional()
  @IsString()
  engagement?: string;

  @IsOptional()
  @IsString()
  orderReference?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateGiftDto extends PartialType(CreateGiftDto) {}

// Bilinmeyen alanları ve $set gibi güncelleme operatörlerini atar.
export const updateBodyPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
