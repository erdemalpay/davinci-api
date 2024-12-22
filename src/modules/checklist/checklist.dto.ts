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
