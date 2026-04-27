import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { MonthlyActivityController } from './monthly-activity.controller';
import {
  MonthlyActivity,
  MonthlyActivitySchema,
} from './monthly-activity.schema';
import { MonthlyActivityService } from './monthly-activity.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(MonthlyActivity.name, MonthlyActivitySchema),
]);

@Module({
  imports: [mongooseModule],
  controllers: [MonthlyActivityController],
  providers: [MonthlyActivityService],
  exports: [MonthlyActivityService],
})
export class MonthlyActivityModule {}