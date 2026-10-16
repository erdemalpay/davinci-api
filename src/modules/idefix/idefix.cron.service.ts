import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarketplaceCron } from '../order/marketplace-cron';
import { IdefixClient } from './idefix.client';
import { IdefixOrderService } from './idefix-order.service';

@Injectable()
export class IdefixCronService extends MarketplaceCron {
  protected readonly label = 'idefix';

  constructor(
    idefixClient: IdefixClient,
    idefixOrderService: IdefixOrderService,
  ) {
    super(idefixClient, idefixOrderService);
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
