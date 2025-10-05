import { CheckDuty } from './check.schema';
import { ChecklistDuty } from './checklist.schema';

export class CreateChecklistDto {
  name: string;
  duties?: ChecklistDuty[];
}

export class CreateCheckDto {
  name: string;
  user: string;
  location: number;
  checklist: string;
  duties: CheckDuty[];
  isCompleted: boolean;
  createdAt: Date;
}
export class CheckQueryDto {
  page?: number;
  limit?: number;
  createdBy?: string;
  checklist?: string;
  location?: number | string;
  date?: string;
  after?: string;
  before?: string;
  sort?: string;
  asc?: number | '1' | '0' | '-1';
}
