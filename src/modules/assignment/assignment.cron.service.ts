import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AssignmentService } from './assignment.service';

@Injectable()
export class AssignmentCronService {
  private readonly logger = new Logger(AssignmentCronService.name);

  constructor(private readonly assignmentService: AssignmentService) {}

  @Cron('0 0 1 * * *', { timeZone: 'Europe/Istanbul' })
  async handleGameAssignmentReminders() {
    try {
      const result =
        await this.assignmentService.processGameAssignmentReminders();

      this.logger.log(
        `Game assignment reminders completed: ${result.fiveDayReminders} five-day, ${result.oneDayReminders} one-day, ${result.managersInformed} manager, ${result.failures} failed`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        'Game assignment reminder cron failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
