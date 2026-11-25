import { Module } from '@nestjs/common';
import { ShopifyAppProxyGuard } from '../shopify/shopify-app-proxy.guard';
import { ShopifyModule } from '../shopify/shopify.module';
import { StorefrontAccountController } from './storefront-account.controller';
import { StorefrontAccountService } from './storefront-account.service';
import { StorefrontReviewsService } from './storefront-reviews.service';

@Module({
  imports: [ShopifyModule],
  providers: [
    StorefrontAccountService,
    StorefrontReviewsService,
    ShopifyAppProxyGuard,
  ],
  controllers: [StorefrontAccountController],
})
export class StorefrontAccountModule {}
