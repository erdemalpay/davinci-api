import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { OrderModule } from '../order/order.module';
import { PanelControlModule } from './../panelControl/panelControl.module';
import { MenuCategory, MenuCategorySchema } from './category.schema';
import { MenuItem, MenuItemSchema } from './item.schema';
import { Kitchen, KitchenSchema } from './kitchen.schema';
import { MenuController } from './menu.controller';
import { MenuGateway } from './menu.gateway';
import { MenuService } from './menu.service';
import { Popular, PopularSchema } from './popular.schema';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(MenuItem.name, MenuItemSchema),
  createAutoIncrementConfig(MenuCategory.name, MenuCategorySchema),
  createAutoIncrementConfig(Popular.name, PopularSchema),
  { name: Kitchen.name, useFactory: () => KitchenSchema },
]);

@Module({
  imports: [mongooseModule, PanelControlModule, OrderModule],
  providers: [MenuService, MenuGateway],
  exports: [MenuService],
  controllers: [MenuController],
})
export class MenuModule {}
