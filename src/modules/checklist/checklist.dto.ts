import { CheckDuty } from './check.schema';

export class CreateChecklistDto {
  name: string;
  duties?: string[];
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
