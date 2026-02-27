import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { SubscriptionStatus } from './back-in-stock.schema';

export class CreateBackInStockSubscriptionDto {
  @IsEmail()
  @IsNotEmpty()
  @ApiProperty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  shop!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  productTitle!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  productUrl!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  variantId!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  variantTitle!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  variantPrice!: string;

  @IsISO8601()
  @IsNotEmpty()
  @ApiProperty()
  subscribedAt!: string;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ required: false })
  timestamp?: number;
}

export class UpdateSubscriptionStatusDto {
  @IsEnum(SubscriptionStatus)
  @ApiProperty({ enum: SubscriptionStatus })
  status!: SubscriptionStatus;
}

export class UnsubscribeByEmailDto {
  @IsEmail()
  @IsNotEmpty()
  @ApiProperty()
  email!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false })
  variantId?: string;
}

export class BackInStockQueryDto {
  @IsNumber()
  @IsOptional()
  page?: number;

  @IsNumber()
  @IsOptional()
  limit?: number;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  shop?: string;

  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  @IsOptional()
  variantId?: string;

  @IsEnum(SubscriptionStatus)
  @IsOptional()
  status?: SubscriptionStatus;

  @IsString()
  @IsOptional()
  after?: string;

  @IsString()
  @IsOptional()
  before?: string;

  @IsString()
  @IsOptional()
  sort?: string;

  @IsNumber()
  @IsOptional()
  asc?: number;
}
