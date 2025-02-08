export class CreateShiftDto {
  day: string;
  location: number;
  shifts: {
    shift: string;
    user: string;
  }[];
}

export class ShiftQueryDto {
  after: string;
  before: string;
  location: number;
}
