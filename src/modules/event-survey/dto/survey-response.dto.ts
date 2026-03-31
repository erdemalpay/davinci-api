import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SurveyAnswerDto {
  @IsNumber()
  questionId: number;

  @IsString()
  questionLabel: string;

  answer: string | string[];
}

export class SubmitSurveyDto {
  @IsNumber()
  eventId: number;

  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsBoolean()
  emailMarketingConsent: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SurveyAnswerDto)
  answers?: SurveyAnswerDto[];
}

export class SurveyResponseQueryDto {
  @IsOptional()
  @IsNumber()
  eventId?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;
}
