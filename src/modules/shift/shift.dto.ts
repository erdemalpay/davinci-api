export class ShiftValue {
  shift: string;
  user?: string[];
}
export class CreateShiftDto {
  day: string;
  location: number;
  shifts: ShiftValue[];
}
export class ShiftQueryDto {
  after: string;
  before?: string;
  location?: number;
}
