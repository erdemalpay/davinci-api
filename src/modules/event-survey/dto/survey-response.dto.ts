import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

/** CampaignForm: tek seçim/metin/onay → string; çoklu seçim → string[] */
@ValidatorConstraint({ name: 'surveyAnswerShape', async: false })
export class SurveyAnswerShapeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return true;
    if (Array.isArray(value)) return value.every((item) => typeof item === 'string');
    return false;
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} metin veya metin dizisi olmalıdır`;
  }
}

export class SurveyAnswerDto {
  @IsNumber()
  questionId: number;

  @IsString()
  questionLabel: string;

  @Validate(SurveyAnswerShapeConstraint)
  answer: string | string[];
}

export class SubmitSurveyDto {
  @IsNumber()
  eventId: number;

  @IsOptional()
  @IsString()
  fullName?: string;

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

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
