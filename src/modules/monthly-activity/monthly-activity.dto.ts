import { IsOptional, IsString } from 'class-validator';

export class CreateMonthlyActivityDto {
  @IsString()
  imageUrl: string;

  @IsOptional()
  @IsString()
  monthInfo?: string;
}