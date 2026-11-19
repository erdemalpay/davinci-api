import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CAFE_TIME_ZONE } from 'src/utils/cafeTime';
import { LoyaltyService } from './loyalty.service';

@Injectable()
export class LoyaltyCronService {
  private readonly logger = new Logger(LoyaltyCronService.name);

  constructor(private readonly loyaltyService: LoyaltyService) {}

  // Shopify stops accepting the code on its own at endsAt; this only keeps the
  // panel and the customer page right. Expired coupons give no points back.
  @Cron('0 15 * * * *', { timeZone: CAFE_TIME_ZONE })
  async expireCoupons() {
    try {
      await this.loyaltyService.expireCoupons();
    } catch (error) {
      this.logger.error('Failed to expire loyalty coupons', error);
    }
  }
}
