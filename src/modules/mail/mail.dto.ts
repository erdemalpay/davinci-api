import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { MailType } from './mail.schema';

export class SubscribeDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    example: [MailType.NEWSLETTER, MailType.PROMOTIONAL],
    enum: MailType,
    isArray: true,
  })
  @IsArray()
  @IsEnum(MailType, { each: true })
  @IsOptional()
  subscribedTypes?: MailType[];

  @ApiPropertyOptional({ example: 'en' })
  @IsString()
  @IsOptional()
  locale?: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UnsubscribeDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  token?: string;
}

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({
    example: [MailType.NEWSLETTER],
    enum: MailType,
    isArray: true,
  })
  @IsArray()
  @IsEnum(MailType, { each: true })
  @IsOptional()
  subscribedTypes?: MailType[];

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsString()
  @IsOptional()
  locale?: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class SendMailDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  to: string;

  @ApiProperty({ example: MailType.WELCOME, enum: MailType })
  @IsEnum(MailType)
  mailType: MailType;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  variables?: Record<string, any>;

  @ApiPropertyOptional({ example: 'en' })
  @IsString()
  @IsOptional()
  locale?: string;
}

export class SendBulkMailDto {
  @ApiProperty({ example: ['user1@example.com', 'user2@example.com'] })
  @IsArray()
  @IsEmail({}, { each: true })
  recipients: string[];

  @ApiProperty({ example: MailType.NEWSLETTER, enum: MailType })
  @IsEnum(MailType)
  mailType: MailType;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  variables?: Record<string, any>;

  @ApiPropertyOptional({ example: 'en' })
  @IsString()
  @IsOptional()
  locale?: string;
}

export class CreateTemplateDto {
  @ApiProperty({ example: 'welcome-email-v1' })
  @IsString()
  name: string;

  @ApiProperty({ example: MailType.WELCOME, enum: MailType })
  @IsEnum(MailType)
  mailType: MailType;

  @ApiProperty({ example: 'Welcome to Our Platform!' })
  @IsString()
  subject: string;

  @ApiProperty({ example: '<h1>Welcome {{name}}!</h1>' })
  @IsString()
  htmlContent: string;

  @ApiPropertyOptional({ example: 'Welcome {{name}}!' })
  @IsString()
  @IsOptional()
  textContent?: string;

  @ApiPropertyOptional({ example: ['name', 'email'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  requiredVariables?: string[];

  @ApiPropertyOptional({ example: 'en' })
  @IsString()
  @IsOptional()
  locale?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional({ example: 'Welcome to Our Platform!' })
  @IsString()
  @IsOptional()
  subject?: string;

  @ApiPropertyOptional({ example: '<h1>Welcome {{name}}!</h1>' })
  @IsString()
  @IsOptional()
  htmlContent?: string;

  @ApiPropertyOptional({ example: 'Welcome {{name}}!' })
  @IsString()
  @IsOptional()
  textContent?: string;

  @ApiPropertyOptional({ example: ['name', 'email'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  requiredVariables?: string[];

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class GetMailLogsDto {
  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: MailType.WELCOME, enum: MailType })
  @IsEnum(MailType)
  @IsOptional()
  mailType?: MailType;

  @ApiPropertyOptional({ example: 'sent' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  skip?: number;
}
