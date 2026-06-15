import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MiddlemanService } from './middleman.service';

@Injectable()
export class MiddlemanCronService {
  private readonly logger = new Logger(MiddlemanCronService.name);

  constructor(private readonly middlemanService: MiddlemanService) {}

  @Cron('0 10 0 * * *', { timeZone: 'Europe/Istanbul' })
  async handleAutoCloseStaleMiddlemen() {
    this.logger.log('🔄 [Cron] Closing stale middleman records…');

    const closedCount = await this.middlemanService.autoCloseStale();

    if (closedCount > 0) {
      this.logger.log(`✅ Auto-closed ${closedCount} middleman record(s)`);
    } else {
      this.logger.log('ℹ️  No stale middleman records found');
    }
  }
}
