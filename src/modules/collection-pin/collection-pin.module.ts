import { Module } from '@nestjs/common';
import { ShopifyModule } from '../shopify/shopify.module';
import { CollectionPinCronService } from './collection-pin.cron.service';
import { CollectionPinService } from './collection-pin.service';

@Module({
  imports: [ShopifyModule],
  providers: [CollectionPinService, CollectionPinCronService],
})
export class CollectionPinModule {}
