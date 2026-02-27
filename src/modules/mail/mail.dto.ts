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
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsArray()
  @IsEnum(MailType, { each: true })
  @IsOptional()
  subscribedTypes?: MailType[];

  @IsString()
  @IsOptional()
  locale?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UnsubscribeDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  token?: string;
}

export class UpdateSubscriptionDto {
  @IsArray()
  @IsEnum(MailType, { each: true })
  @IsOptional()
  subscribedTypes?: MailType[];

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  locale?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class SendMailDto {
  @IsEmail()
  to: string;

  @IsEnum(MailType)
  mailType: MailType;

  @IsObject()
  @IsOptional()
  variables?: Record<string, any>;

  @IsString()
  @IsOptional()
  locale?: string;
}

export class SendBulkMailDto {
  @IsArray()
  @IsEmail({}, { each: true })
  recipients: string[];

  @IsEnum(MailType)
  mailType: MailType;

  @IsObject()
  @IsOptional()
  variables?: Record<string, any>;

  @IsString()
  @IsOptional()
  locale?: string;
}

export class CreateTemplateDto {
  @IsString()
  name: string;

  @IsEnum(MailType)
  mailType: MailType;

  @IsString()
  subject: string;

  @IsString()
  htmlContent: string;

  @IsString()
  @IsOptional()
  textContent?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  requiredVariables?: string[];

  @IsString()
  @IsOptional()
  locale?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateTemplateDto {
  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  htmlContent?: string;

  @IsString()
  @IsOptional()
  textContent?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  requiredVariables?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class GetMailLogsDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsEnum(MailType)
  @IsOptional()
  mailType?: MailType;

  @IsString()
  @IsOptional()
  status?: string;

  @IsOptional()
  limit?: number;

  @IsOptional()
  skip?: number;
}

export class GetSubscriptionsDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsEnum(MailType)
  @IsOptional()
  mailType?: MailType;

  @IsString()
  @IsOptional()
  locale?: string;

  @IsString()
  @IsOptional()
  after?: string;

  @IsString()
  @IsOptional()
  before?: string;

  @IsString()
  @IsOptional()
  sort?: string;

  @IsOptional()
  asc?: number;

  @IsString()
  @IsOptional()
  search?: string;
}
