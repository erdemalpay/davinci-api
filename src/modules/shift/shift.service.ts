import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ShiftGateway } from './shift.gateway';
import { Shift } from './shift.schema';

export class ShiftService {
  constructor(
    @InjectModel(Shift.name) private shiftModel: Model<Shift>,
    private readonly shiftGateway: ShiftGateway,
  ) {}
}
