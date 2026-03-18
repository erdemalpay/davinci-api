import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { LocationModule } from '../location/location.module';
import { UserModule } from '../user/user.module';
import { VisitModule } from '../visit/visit.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { NotificationController } from './notification.controller';
import { Notification, NotificationSchema } from './notification.schema';
import { NotificationService } from './notification.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Notification.name, NotificationSchema),
]);

@Module({
  imports: [
    WebSocketModule,
    mongooseModule,
    LocationModule,
    UserModule,
    forwardRef(() => VisitModule),
  ],
  providers: [NotificationService],
  exports: [NotificationService],
  controllers: [NotificationController],
})
export class NotificationModule {}
