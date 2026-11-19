import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { ShopifyAppProxyGuard } from '../shopify/shopify-app-proxy.guard';
import { ShopifyModule } from '../shopify/shopify.module';
import { WebSocketModule } from '../websocket/websocket.module';
import {
  FavoriteController,
  FavoriteStorefrontController,
} from './favorite.controller';
import { Favorite, FavoriteSchema } from './favorite.schema';
import { FavoriteService } from './favorite.service';

@Module({
  imports: [
    WebSocketModule,
    ShopifyModule,
    MongooseModule.forFeatureAsync([
      createAutoIncrementConfig(Favorite.name, FavoriteSchema),
    ]),
  ],
  providers: [FavoriteService, ShopifyAppProxyGuard],
  controllers: [FavoriteController, FavoriteStorefrontController],
  exports: [FavoriteService],
})
export class FavoriteModule {}
