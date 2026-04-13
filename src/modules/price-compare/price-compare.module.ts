import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MenuModule } from '../menu/menu.module';
import { PriceCompareLogModule } from '../price-compare-log/price-compare-log.module';
import {
  LocalComparison,
  LocalComparisonSchema,
} from './local-comparison.schema';
import { PriceCompareController } from './price-compare.controller';
import { PriceCompareCronService } from './price-compare.cron.service';
import { PriceCompareService } from './price-compare.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  { name: LocalComparison.name, useFactory: () => LocalComparisonSchema },
]);

@Module({
  imports: [HttpModule, MenuModule, PriceCompareLogModule, mongooseModule],
  controllers: [PriceCompareController],
  providers: [PriceCompareService, PriceCompareCronService],
  exports: [PriceCompareService],
})
export class PriceCompareModule {}
