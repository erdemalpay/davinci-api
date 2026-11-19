import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ShopifyModule } from '../shopify/shopify.module';
import { WebSocketModule } from '../websocket/websocket.module';
import {
  LoyaltyController,
  LoyaltyStorefrontController,
} from './loyalty.controller';
import { LoyaltyCronService } from './loyalty.cron.service';
import {
  LoyaltyAccount,
  LoyaltyAccountSchema,
  LoyaltyCoupon,
  LoyaltyCouponSchema,
  LoyaltySettings,
  LoyaltySettingsSchema,
  LoyaltyTransaction,
  LoyaltyTransactionSchema,
} from './loyalty.schema';
import { LoyaltyService } from './loyalty.service';
import { ShopifyAppProxyGuard } from '../shopify/shopify-app-proxy.guard';

@Module({
  imports: [
    WebSocketModule,
    ShopifyModule,
    MongooseModule.forFeatureAsync([
      createAutoIncrementConfig(LoyaltyAccount.name, LoyaltyAccountSchema),
      createAutoIncrementConfig(
        LoyaltyTransaction.name,
        LoyaltyTransactionSchema,
      ),
      createAutoIncrementConfig(LoyaltyCoupon.name, LoyaltyCouponSchema),
      { name: LoyaltySettings.name, useFactory: () => LoyaltySettingsSchema },
    ]),
  ],
  providers: [LoyaltyService, LoyaltyCronService, ShopifyAppProxyGuard],
  controllers: [LoyaltyController, LoyaltyStorefrontController],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
