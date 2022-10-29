import { Module } from '@nestjs/common';
import { ShiftService } from './shift.service';
import { ShiftController } from './shift.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { ShiftPlan, ShiftPlanSchema } from './shiftPlan.schema';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ShiftSlot, ShiftSlotSchema } from './shiftSlot.schema';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(ShiftPlan.name, ShiftPlanSchema),
  createAutoIncrementConfig(ShiftSlot.name, ShiftSlotSchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [ShiftService],
  exports: [ShiftService],
  controllers: [ShiftController],
})
export class ShiftModule {}
