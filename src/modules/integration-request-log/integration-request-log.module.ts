import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { IntegrationRequestLogController } from './integration-request-log.controller';
import {
  IntegrationRequestLog,
  IntegrationRequestLogSchema,
} from './integration-request-log.schema';
import { IntegrationRequestLogService } from './integration-request-log.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(
    IntegrationRequestLog.name,
    IntegrationRequestLogSchema,
  ),
]);

@Module({
  imports: [mongooseModule],
  providers: [IntegrationRequestLogService],
  controllers: [IntegrationRequestLogController],
  exports: [IntegrationRequestLogService],
})
export class IntegrationRequestLogModule {}
