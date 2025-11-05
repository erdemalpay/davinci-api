import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { VisitService } from './visit.service';

@Injectable()
export class VisitCronService {
  private readonly logger = new Logger(VisitCronService.name);

  constructor(private readonly visitService: VisitService) {}

  @Cron('0 0 1 * * *', { timeZone: 'Europe/Istanbul' })
  async handleNotifyUnfinishedVisits() {
    this.logger.log('🔄 [Cron] Checking for unfinished visits…');

    const notifiedCount = await this.visitService.notifyUnfinishedVisits();

    if (notifiedCount > 0) {
      this.logger.log(`✅ Found ${notifiedCount} unfinished visit(s) and notified managers`);
    } else {
      this.logger.log('ℹ️  No unfinished visits found');
    }
  }
}
