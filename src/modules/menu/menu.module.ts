import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { MenuController } from './menu.controller';
import { MenuItem, MenuItemSchema } from './item.schema';
import { MenuCategory, MenuCategorySchema } from './category.schema';
import { MenuService } from './menu.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(MenuItem.name, MenuItemSchema),
  createAutoIncrementConfig(MenuCategory.name, MenuCategorySchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [MenuService],
  exports: [MenuService],
  controllers: [MenuController],
})
export class MenuModule {}
