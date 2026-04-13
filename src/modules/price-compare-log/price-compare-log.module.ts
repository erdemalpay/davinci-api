import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { PriceCompareLogController } from './price-compare-log.controller';
import {
  PriceCompareLog,
  PriceCompareLogSchema,
} from './price-compare-log.schema';
import { PriceCompareLogService } from './price-compare-log.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(PriceCompareLog.name, PriceCompareLogSchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [PriceCompareLogService],
  controllers: [PriceCompareLogController],
  exports: [PriceCompareLogService],
})
export class PriceCompareLogModule {}
