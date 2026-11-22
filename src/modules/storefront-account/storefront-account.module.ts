import { Module } from '@nestjs/common';
import { ShopifyAppProxyGuard } from '../shopify/shopify-app-proxy.guard';
import { ShopifyModule } from '../shopify/shopify.module';
import { StorefrontAccountController } from './storefront-account.controller';
import { StorefrontAccountService } from './storefront-account.service';

@Module({
  imports: [ShopifyModule],
  providers: [StorefrontAccountService, ShopifyAppProxyGuard],
  controllers: [StorefrontAccountController],
})
export class StorefrontAccountModule {}
