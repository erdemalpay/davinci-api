import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PriceCompareService } from './price-compare.service';

@Injectable()
export class PriceCompareCronService {
  private readonly logger = new Logger(PriceCompareCronService.name);

  constructor(private readonly priceCompareService: PriceCompareService) {}

  @Cron('0 0 3 * * *', { timeZone: 'Europe/Istanbul' })
  async syncDailyLocalComparison() {
    this.logger.log('Starting daily local comparison sync');

    try {
      const result = await this.priceCompareService.syncLocalComparisonToDb();

      this.logger.log(
        `Completed daily local comparison sync - ${JSON.stringify(result)}`,
      );

      return result;
    } catch (error) {
      this.logger.error('Error in daily local comparison sync', error);
      throw error;
    }
  }

  async triggerManualSync() {
    this.logger.log('Manual trigger: local comparison sync');
    return this.syncDailyLocalComparison();
  }
}
