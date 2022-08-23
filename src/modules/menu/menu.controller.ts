import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { MenuService } from './menu.service';
import { CreateCategoryDto, CreateItemDto } from './menu.dto';
import { UpdateQuery } from 'mongoose';
import { MenuCategory } from './category.schema';
import { MenuItem } from './item.schema';
import { Public } from '../auth/public.decorator';

@Controller('/menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

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
}
