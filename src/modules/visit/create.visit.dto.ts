import { VisitSource } from './visit.dto';

export class CreateVisitDto {
  location: number;
  date: string;
  startHour: string;
  visitStartSource?: VisitSource;
}
