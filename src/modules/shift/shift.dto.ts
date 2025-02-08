export class CreateShiftDto {
  day: string;
  location: number;
  shifts: {
    shift: string;
    user: string;
  }[];
}
