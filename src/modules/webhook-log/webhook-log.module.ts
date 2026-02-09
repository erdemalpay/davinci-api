import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { WebhookLogController } from './webhook-log.controller';
import { WebhookLog, WebhookLogSchema } from './webhook-log.schema';
import { WebhookLogService } from './webhook-log.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(WebhookLog.name, WebhookLogSchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [WebhookLogService],
  controllers: [WebhookLogController],
  exports: [WebhookLogService],
})
export class WebhookLogModule {}
