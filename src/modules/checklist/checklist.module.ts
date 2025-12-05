import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LocationModule } from '../location/location.module';
import { NotificationModule } from '../notification/notification.module';
import { Check, CheckSchema } from './check.schema';
import { ChecklistController } from './checklist.controller';
import { Checklist, ChecklistSchema } from './checklist.schema';
import { ChecklistService } from './checklist.service';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  { name: Checklist.name, useFactory: () => ChecklistSchema },
  { name: Check.name, useFactory: () => CheckSchema },
]);

@Module({
  imports: [
    WebSocketModule,
    mongooseModule,
    NotificationModule,
    forwardRef(() => LocationModule),
  ],
  providers: [ChecklistService],
  controllers: [ChecklistController],
  exports: [
    mongooseModule,
    ChecklistService,
    ChecklistModule,
  ], // Export mongooseModule here
})
export class ChecklistModule {}
