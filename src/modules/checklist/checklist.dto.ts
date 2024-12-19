export class CreateChecklistDto {
  name: string;
  active: boolean;
  locations: number[];
}

export class CreateCheckDto {
  name: string;
  user: string;
  location: number;
  checklist: string;
  isCompleted: boolean;
  createdAt: Date;
}
