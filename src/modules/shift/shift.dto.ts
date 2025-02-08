export class CreateShiftsDto {
  day: string;
  location: number;
  shifts: {
    shift: string;
    user: string;
  }[];
}
