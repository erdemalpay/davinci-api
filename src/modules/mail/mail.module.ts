import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { MailController } from './mail.controller';
import {
  MailLog,
  MailLogSchema,
  MailSubscription,
  MailSubscriptionSchema,
  MailTemplate,
  MailTemplateSchema,
} from './mail.schema';
import { MailSeeder } from './mail.seeder';
import { MailService } from './mail.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(MailSubscription.name, MailSubscriptionSchema),
  createAutoIncrementConfig(MailLog.name, MailLogSchema),
  createAutoIncrementConfig(MailTemplate.name, MailTemplateSchema),
]);

@Module({
  imports: [mongooseModule],
  controllers: [MailController],
  providers: [MailService, MailSeeder],
  exports: [MailService, MongooseModule],
})
export class MailModule {}
