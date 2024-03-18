import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UpdateQuery } from 'mongoose';
import { Public } from '../auth/public.decorator';
import { MenuCategory } from './category.schema';
import { MenuItem } from './item.schema';
import { CreateCategoryDto, CreateItemDto, CreatePopularDto } from './menu.dto';
import { MenuService } from './menu.service';

@Controller('/menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Public()
  @Get('/categories')
  getCategories() {
    return this.menuService.findAllCategories();
  }

  @Public()
  @Get('/items')
  getItems() {
    return this.menuService.findAllItems();
  }

  @Post('/categories')
  createCategory(@Body() createCategoryDto: CreateCategoryDto) {
    return this.menuService.createCategory(createCategoryDto);
  }

  @Post('/items')
  createItem(@Body() createItemDto: CreateItemDto) {
    return this.menuService.createItem(createItemDto);
  }
  @Get('/items/setOrder')
  setOrder() {
    return this.menuService.setOrder();
  }

  @Patch('/categories/:id')
  updateCategory(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<MenuCategory>,
  ) {
    return this.menuService.updateCategory(id, updates);
  }

  @Patch('/items/:id')
  updateItem(@Param('id') id: number, @Body() updates: UpdateQuery<MenuItem>) {
    return this.menuService.updateItem(id, updates);
  }

  @Delete('/categories/:id')
  deleteCategory(@Param('id') id: number) {
    return this.menuService.removeCategory(id);
  }

  @Delete('/items/:id')
  deleteItem(@Param('id') id: number) {
    return this.menuService.removeItem(id);
  }
  // popular
  @Public()
  @Get('/popular')
  getPopular() {
    return this.menuService.findAllPopular();
  }

  @Post('/popular')
  createPopular(@Body() createPopularDto: CreatePopularDto) {
    return this.menuService.createPopular(createPopularDto);
  }

  @Patch('/popular/:id')
  updatePopular(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<MenuItem>,
  ) {
    return this.menuService.updatePopular(id, updates);
  }

  @Delete('/popular/:id')
  deletePopular(@Param('id') id: number) {
    return this.menuService.removePopular(id);
  }
}
