import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { N11Client } from './n11.client';
import { N11OrderService } from './n11-order.service';

@Injectable()
export class N11CronService {
  private readonly logger = new Logger(N11CronService.name);

  constructor(
    private readonly n11Client: N11Client,
    private readonly n11OrderService: N11OrderService,
  ) {}

  @Cron('*/2 * * * *')
  async handleOrderSync() {
    if (!this.n11Client.isProduction) return;
    try {
      const result = await this.n11OrderService.syncOrders();
      if ('created' in result && (result.created > 0 || result.cancelled > 0)) {
        this.logger.log(`n11 order sync: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      // Ham hata appsecret header'ı ve SOAP zarfı içerebilir; yalnızca mesaj loglanır.
      this.logger.error(
        `Error in scheduled task: n11 order sync: ${error?.message}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleAcceptedClaims() {
    if (!this.n11Client.isProduction) return;
    try {
      const result = await this.n11OrderService.processAcceptedClaims();
      this.logger.log(
        `Completed scheduled task: Process n11 claims - Stats: ${JSON.stringify(
          result.stats,
        )}`,
      );
    } catch (error) {
      this.logger.error(
        `Error in scheduled task: Process n11 claims: ${error?.message}`,
      );
    }
  }

  triggerManualOrderSync() {
    this.logger.log('Manual trigger: n11 order sync');
    return this.n11OrderService.syncOrders();
  }

  triggerManualClaimsProcessing() {
    this.logger.log('Manual trigger: Process n11 claims');
    return this.n11OrderService.processAcceptedClaims();
  }
}
