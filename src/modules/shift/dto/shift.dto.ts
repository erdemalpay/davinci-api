import { IsNumber, IsString } from 'class-validator';
import { ShiftValues } from '../shiftDataTypes';

export class ShiftPlanDto {
  @IsString()
  startDate: string;
}

export class ShiftSlotDto {
  @IsString()
  startDate: string;

  day: number;

  shift: ShiftValues;

  location: Location;

  requiredPerson: number;

  active: boolean;
}
