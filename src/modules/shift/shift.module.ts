import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ShiftController } from './shift.controller';
import { ShiftGateway } from './shift.gateway';
import { Shift, ShiftSchema } from './shift.schema';
import { ShiftService } from './shift.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Shift.name, ShiftSchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [ShiftService, ShiftGateway],
  exports: [ShiftService, ShiftGateway],
  controllers: [ShiftController],
})
export class ShiftModule {}
