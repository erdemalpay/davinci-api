import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { LocationModule } from '../location/location.module';
import { NotificationModule } from '../notification/notification.module';
import { OrderModule } from '../order/order.module';
import { RedisModule } from '../redis/redis.module';
import { VisitModule } from '../visit/visit.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { AccountingModule } from './../accounting/accounting.module';
import { ActivityModule } from './../activity/activity.module';
import { HepsiburadaModule } from './../hepsiburada/hepsiburada.module';
import { IkasModule } from './../ikas/ikas.module';
import { PanelControlModule } from './../panelControl/panelControl.module';
import { ShopifyModule } from './../shopify/shopify.module';
import { TrendyolModule } from './../trendyol/trendyol.module';
import { MenuCategory, MenuCategorySchema } from './category.schema';
import { MenuItem, MenuItemSchema } from './item.schema';
import { Kitchen, KitchenSchema } from './kitchen.schema';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { Popular, PopularSchema } from './popular.schema';
import { UpperCategory, UpperCategorySchema } from './upperCategory.schema';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(MenuItem.name, MenuItemSchema),
  createAutoIncrementConfig(MenuCategory.name, MenuCategorySchema),
  createAutoIncrementConfig(Popular.name, PopularSchema),
  createAutoIncrementConfig(UpperCategory.name, UpperCategorySchema),
  { name: Kitchen.name, useFactory: () => KitchenSchema },
]);

@Module({
  imports: [
    WebSocketModule,
    mongooseModule,
    ActivityModule,
    PanelControlModule,
    RedisModule,
    LocationModule,
    NotificationModule,
    VisitModule,
    forwardRef(() => AccountingModule),
    forwardRef(() => OrderModule),
    forwardRef(() => IkasModule),
    forwardRef(() => ShopifyModule),
    forwardRef(() => TrendyolModule),
    forwardRef(() => HepsiburadaModule),
  ],
  providers: [MenuService],
  exports: [MenuService],
  controllers: [MenuController],
})
export class MenuModule {}
