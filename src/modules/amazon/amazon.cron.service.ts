import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarketplaceCron } from '../order/marketplace-cron';
import { AmazonClient } from './amazon.client';
import { AmazonOrderService } from './amazon-order.service';

@Injectable()
export class AmazonCronService extends MarketplaceCron {
  protected readonly label = 'amazon';

  constructor(
    amazonClient: AmazonClient,
    amazonOrderService: AmazonOrderService,
  ) {
    super(amazonClient, amazonOrderService);
  }

  // searchOrders ~3 dakikada 1 istek izin verir; 5 dakika güvenli aralıktır.
  @Cron('*/5 * * * *')
  handleOrderSync() {
    return this.runOrderSync();
  }

  // İade raporu günlük güncellenir; işlenenler kayıt tablosundan atlanır.
  @Cron(CronExpression.EVERY_6_HOURS)
  handleReturns() {
    return this.runClaimsProcessing();
  }
}
