import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ConcurrencyLogController } from './concurrency-log.controller';
import { ConcurrencyLogService } from './concurrency-log.service';
import { ConcurrencyLog, ConcurrencyLogSchema } from './concurrency-log.schema';
import { ConcurrencyTrackerInterceptor } from './concurrency-tracker.interceptor';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(ConcurrencyLog.name, ConcurrencyLogSchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [
    ConcurrencyLogService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ConcurrencyTrackerInterceptor,
    },
  ],
  controllers: [ConcurrencyLogController],
  exports: [ConcurrencyLogService],
})
export class ConcurrencyLogModule {}
