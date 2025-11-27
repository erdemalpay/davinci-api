export enum VisitSource {
  PANEL = 'panel',
  FACE_RECOGNITION = 'face_recognition',
}
export class VisitDto {
  _id?: number;
  location?: number;
  date?: string;
  startHour?: string;
  finishHour?: string;
  user?: string;
  visitStartSource?: VisitSource;
  visitFinishSource?: VisitSource;
}
export class CafeVisitDto {
  location: number;
  type: VisitTypes;
  userData: string;
  date: string;
  hour: string;
}
export class CafeActivityDto {
  date: string;
  location: number;
  hour: string;
  personCount: number;
  groupName: string;
  price?: number;
  complimentary?: string;
  isCompleted?: boolean;
}

export enum VisitTypes {
  ENTRY = 'entry',
  EXIT = 'exit',
}
