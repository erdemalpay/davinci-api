export class ShiftValue {
  shift: string;
  user?: string[];
  chefUser?: string;
  outsideOperationUsers?: string[];
  shiftEndHour?: string;
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

export class ShiftUserQueryDto {
  after: string;
  before?: string;
  user: string;
}
