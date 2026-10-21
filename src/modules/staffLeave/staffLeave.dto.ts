import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateStaffLeaveTypeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  backgroundColor?: string;
}

export class CreateStaffLeaveDto {
  @IsString()
  user: string;

  @IsInt()
  type: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

export class StaffLeaveQueryDto {
  @IsOptional()
  @IsDateString()
  after?: string;

  @IsOptional()
  @IsDateString()
  before?: string;
}
