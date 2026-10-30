import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import { CAFE_TIME_ZONE } from 'src/utils/cafeTime';
import { AnomalyService } from './anomaly.service';

@Injectable()
export class AnomalyCronService {
  private readonly logger = new Logger(AnomalyCronService.name);

  constructor(private readonly anomalyService: AnomalyService) {}

  // The previous cafe day, once it's over (it runs until 06:00).
  @Cron('0 30 6 * * *', { timeZone: CAFE_TIME_ZONE })
  async checkYesterday() {
    const date = moment
      .tz(CAFE_TIME_ZONE)
      .subtract(1, 'day')
      .format('YYYY-MM-DD');
    try {
      await this.anomalyService.run(date);
    } catch (error) {
      this.logger.error(`Failed to check the anomalies of ${date}`, error);
    }
  }
}
