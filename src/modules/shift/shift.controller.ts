import { Controller } from '@nestjs/common';
import { ShiftService } from './shift.service';

@Controller('/shifts')
export class ShiftController {
  constructor(private readonly shiftService: ShiftService) {}
}
