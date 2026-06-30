import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { AssignmentCronService } from './assignment.cron.service';
import { AssignmentModule } from './assignment.module';
import { AssignmentReminderService } from './assignment.reminder.service';

@Module({
  imports: [AssignmentModule, NotificationModule],
  providers: [AssignmentReminderService, AssignmentCronService],
})
export class AssignmentReminderModule {}
