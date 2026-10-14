import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarketplaceCron } from '../order/marketplace-cron';
import { N11Client } from './n11.client';
import { N11OrderService } from './n11-order.service';

@Injectable()
export class N11CronService extends MarketplaceCron {
  protected readonly label = 'n11';

  constructor(n11Client: N11Client, n11OrderService: N11OrderService) {
    super(n11Client, n11OrderService);
  }

  @Cron('*/2 * * * *')
  handleOrderSync() {
    return this.runOrderSync();
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  handleAcceptedClaims() {
    return this.runClaimsProcessing();
  }
}
