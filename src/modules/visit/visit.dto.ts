export class VisitDto {
  _id?: number;
  location?: number;
  date?: string;
  startHour?: string;
  finishHour?: string;
  user?: string;
}
export class CafeVisitDto {
  location: number;
  type: VisitTypes;
  userData: string;
  date: string;
  hour: string;
}

export enum VisitTypes {
  ENTRY = 'entry',
  EXIT = 'exit',
}
