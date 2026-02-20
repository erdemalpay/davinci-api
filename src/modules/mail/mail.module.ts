import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MailSubscription.name, schema: MailSubscriptionSchema },
      { name: MailLog.name, schema: MailLogSchema },
      { name: MailTemplate.name, schema: MailTemplateSchema },
    ]),
  ],
  controllers: [MailController],
  providers: [MailService, MailSeeder],
  exports: [MailService],
})
export class MailModule {}
