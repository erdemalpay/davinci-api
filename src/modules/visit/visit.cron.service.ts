import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QrCodeService } from './qr-code.service';
import { VisitService } from './visit.service';

@Injectable()
export class VisitCronService {
  private readonly logger = new Logger(VisitCronService.name);

  constructor(
    private readonly visitService: VisitService,
    private readonly qrCodeService: QrCodeService,
  ) {}

  @Cron('0 0 1 * * *', { timeZone: 'Europe/Istanbul' })
  async handleNotifyUnfinishedVisits() {
    this.logger.log('🔄 [Cron] Checking for unfinished visits…');

    const notifiedCount = await this.visitService.notifyUnfinishedVisits();

    if (notifiedCount > 0) {
      this.logger.log(
        `✅ Found ${notifiedCount} unfinished visit(s) and notified managers`,
      );
    } else {
      this.logger.log('ℹ️  No unfinished visits found');
    }
  }

  @Cron(CronExpression.EVERY_2_HOURS, { timeZone: 'Europe/Istanbul' })
  async handleRotateQrCodes() {
    const rotated = await this.qrCodeService.rotateAllActive();
    if (rotated > 0) {
      this.logger.log(
        `🔄 [Cron] Rotated QR code(s) for ${rotated} location(s)`,
      );
    }
  }
}
