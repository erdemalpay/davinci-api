import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export enum AssignmentTypeEnum {
  GAME_LEARNING = 'game_learning',
  INVENTORY_COUNT = 'inventory_count',
  CHECKLIST = 'checklist',
  REVIEW = 'review',
  TRAINING = 'training',
  INSPECTION = 'inspection',
  GENERAL = 'general',
}

export enum AssignmentStatusEnum {
  DRAFT = 'draft',
  ASSIGNED = 'assigned',
  ACCEPTED = 'accepted',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
}

export enum AssignmentPriorityEnum {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export class AssignmentSubjectDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  entityType: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  entityId: string;
}

export class CreateAssignmentDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: AssignmentTypeEnum })
  @IsNotEmpty()
  @IsEnum(AssignmentTypeEnum)
  assignmentType: AssignmentTypeEnum;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  assignedBy: string;

  @ApiProperty({ type: [String] })
  @IsString()
  assignedTo: string;

  @ApiProperty({ required: false, type: AssignmentSubjectDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssignmentSubjectDto)
  subject?: AssignmentSubjectDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  dueDate?: Date;

  @ApiProperty({ enum: AssignmentStatusEnum, required: false })
  @IsOptional()
  @IsEnum(AssignmentStatusEnum)
  status?: AssignmentStatusEnum;

  @ApiProperty({ enum: AssignmentPriorityEnum, required: false })
  @IsOptional()
  @IsEnum(AssignmentPriorityEnum)
  priority?: AssignmentPriorityEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  completedAt?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class UpdateAssignmentDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: AssignmentTypeEnum, required: false })
  @IsOptional()
  @IsEnum(AssignmentTypeEnum)
  assignmentType?: AssignmentTypeEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  assignedBy?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiProperty({ required: false, type: AssignmentSubjectDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssignmentSubjectDto)
  subject?: AssignmentSubjectDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  dueDate?: Date;

  @ApiProperty({ enum: AssignmentStatusEnum, required: false })
  @IsOptional()
  @IsEnum(AssignmentStatusEnum)
  status?: AssignmentStatusEnum;

  @ApiProperty({ enum: AssignmentPriorityEnum, required: false })
  @IsOptional()
  @IsEnum(AssignmentPriorityEnum)
  priority?: AssignmentPriorityEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDate()
  completedAt?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class AssignmentQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: AssignmentTypeEnum })
  @IsOptional()
  @IsString()
  assignmentType?: string;

  @ApiProperty({ required: false, enum: AssignmentStatusEnum })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ required: false, enum: AssignmentPriorityEnum })
  @IsOptional()
  @IsEnum(AssignmentPriorityEnum)
  priority?: AssignmentPriorityEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  assignedBy?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subjectEntityType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  subjectEntityId?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  subjectId?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  after?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  before?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  page?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  limit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  asc?: number;
}

export class CreateGameAssignmentDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  assignedBy: string;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  dueDate: Date;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  assignUsers: string[];

  @ApiProperty()
  @IsNumber()
  gameId: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: AssignmentPriorityEnum, required: false })
  @IsOptional()
  @IsEnum(AssignmentPriorityEnum)
  priority?: AssignmentPriorityEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
