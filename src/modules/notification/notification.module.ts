import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { NotificationController } from './notification.controller';
import { NotificationGateway } from './notification.gateway';
import { Notification, NotificationSchema } from './notification.schema';
import { NotificationService } from './notification.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Notification.name, NotificationSchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [NotificationService, NotificationGateway],
  exports: [NotificationService],
  controllers: [NotificationController],
})
export class NotificationModule {}
