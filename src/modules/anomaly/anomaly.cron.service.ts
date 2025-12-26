import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import { AnomalyService } from './anomaly.service';

@Injectable()
export class AnomalyCronService {
  private readonly logger = new Logger(AnomalyCronService.name);

  constructor(private readonly anomalyService: AnomalyService) {}

  /**
   * Generate previous day's report every day at 2 AM
   */
  @Cron('0 0 2 * * *', { timeZone: 'Europe/Istanbul' })
  async handleDailyReport() {
    this.logger.log('🔄 [Cron] Generating daily anomaly report...');

    try {
      // Previous day's date
      const yesterday = moment().subtract(1, 'day').toDate();
      const report = await this.anomalyService.generateDailyReport(yesterday);

      this.logger.log(
        `✅ Daily anomaly report generated for ${report.date}: ${report.totalAnomalies} anomalies detected`,
      );

      // Log the report (can be sent via email or elsewhere in the future)
      if (report.totalAnomalies > 0) {
        this.logger.warn(
          `⚠️  Anomalies detected: ${JSON.stringify(report.anomaliesByType)}`,
        );
      }
    } catch (error) {
      this.logger.error('Error generating daily anomaly report:', error);
    }
  }
}

