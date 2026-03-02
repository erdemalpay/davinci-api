import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { MailModule } from '../mail/mail.module';
import { MenuModule } from '../menu/menu.module';
import { ShopifyModule } from '../shopify/shopify.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { BackInStockController } from './back-in-stock.controller';
import {
  BackInStockSubscription,
  BackInStockSubscriptionSchema,
} from './back-in-stock.schema';
import { BackInStockService } from './back-in-stock.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(
    BackInStockSubscription.name,
    BackInStockSubscriptionSchema,
  ),
]);

@Module({
  imports: [
    mongooseModule,
    ShopifyModule,
    MenuModule,
    MailModule,
    WebSocketModule,
  ],
  providers: [BackInStockService],
  controllers: [BackInStockController],
  exports: [BackInStockService],
})
export class BackInStockModule {}
