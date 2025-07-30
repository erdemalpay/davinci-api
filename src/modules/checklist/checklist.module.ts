import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationModule } from '../notification/notification.module';
import { Check, CheckSchema } from './check.schema';
import { ChecklistController } from './checklist.controller';
import { ChecklistGateway } from './checklist.gateway';
import { Checklist, ChecklistSchema } from './checklist.schema';
import { ChecklistService } from './checklist.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  { name: Checklist.name, useFactory: () => ChecklistSchema },
  { name: Check.name, useFactory: () => CheckSchema },
]);

@Module({
  imports: [mongooseModule, NotificationModule],
  providers: [ChecklistService, ChecklistGateway],
  controllers: [ChecklistController],
  exports: [
    mongooseModule,
    ChecklistService,
    ChecklistModule,
    ChecklistGateway,
  ], // Export mongooseModule here
})
export class ChecklistModule {}
