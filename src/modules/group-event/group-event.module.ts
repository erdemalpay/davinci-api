import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { LocationModule } from '../location/location.module';
import { MailModule } from '../mail/mail.module';
import { NotificationModule } from '../notification/notification.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { GroupEventMailService } from './group-event-mail.service';
import { GroupEventController } from './group-event.controller';
import { GroupEvent, GroupEventSchema } from './group-event.schema';
import { GroupEventService } from './group-event.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(GroupEvent.name, GroupEventSchema),
]);

@Module({
  imports: [
    mongooseModule,
    WebSocketModule,
    LocationModule,
    MailModule,
    NotificationModule,
  ],
  controllers: [GroupEventController],
  providers: [GroupEventService, GroupEventMailService],
})
export class GroupEventModule {}
