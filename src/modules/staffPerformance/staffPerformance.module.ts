import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { Gameplay, GameplaySchema } from '../gameplay/gameplay.schema';
import { Collection, CollectionSchema } from '../order/collection.schema';
import { Order, OrderSchema } from '../order/order.schema';
import { StaffPerformanceController } from './staffPerformance.controller';
import { StaffPerformanceService } from './staffPerformance.service';

// Read-only: counts for the staff performance page.
const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Order.name, OrderSchema),
  createAutoIncrementConfig(Collection.name, CollectionSchema),
  createAutoIncrementConfig(Gameplay.name, GameplaySchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [StaffPerformanceService],
  controllers: [StaffPerformanceController],
})
export class StaffPerformanceModule {}
