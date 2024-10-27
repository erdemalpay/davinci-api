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
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { MenuCategory } from './category.schema';
import { MenuItem } from './item.schema';
import { Kitchen } from './kitchen.schema';
import {
  CreateCategoryDto,
  CreateItemDto,
  CreateKitchenDto,
  CreatePopularDto,
} from './menu.dto';
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
  createCategory(
    @ReqUser() user: User,
    @Body() createCategoryDto: CreateCategoryDto,
  ) {
    return this.menuService.createCategory(user, createCategoryDto);
  }

  @Post('/items')
  createItem(@ReqUser() user: User, @Body() createItemDto: CreateItemDto) {
    return this.menuService.createItem(user, createItemDto);
  }
  @Get('/items/setOrder')
  setOrder(@ReqUser() user: User) {
    return this.menuService.setOrder(user);
  }
  @Patch('/items/update_bulk')
  updateMultipleItems(
    @ReqUser() user: User,
    @Body()
    payload: {
      items: MenuItem[];
    },
  ) {
    return this.menuService.updateMultipleItems(user, payload.items);
  }

  @Patch('/categories/:id')
  updateCategory(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<MenuCategory>,
  ) {
    return this.menuService.updateCategory(user, id, updates);
  }

  @Patch('/items/:id')
  updateItem(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<MenuItem>,
  ) {
    return this.menuService.updateItem(user, id, updates);
  }

  @Delete('/categories/:id')
  deleteCategory(@ReqUser() user: User, @Param('id') id: number) {
    return this.menuService.removeCategory(user, id);
  }

  @Delete('/items/:id')
  deleteItem(@ReqUser() user: User, @Param('id') id: number) {
    return this.menuService.removeItem(user, id);
  }
  // popular
  @Public()
  @Get('/popular')
  getPopular() {
    return this.menuService.findAllPopular();
  }

  @Post('/popular')
  createPopular(
    @ReqUser() user: User,
    @Body() createPopularDto: CreatePopularDto,
  ) {
    return this.menuService.createPopular(user, createPopularDto);
  }

  @Patch('/popular/:id')
  updatePopular(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<MenuItem>,
  ) {
    return this.menuService.updatePopular(user, id, updates);
  }

  @Delete('/popular/:id')
  deletePopular(@ReqUser() user: User, @Param('id') id: number) {
    return this.menuService.removePopular(user, id);
  }
  // kitchen
  @Get('/kitchens')
  getKitchens() {
    return this.menuService.findAllKitchens();
  }

  @Post('/kitchens')
  createKitchen(
    @ReqUser() user: User,
    @Body() createKitchenDto: CreateKitchenDto,
  ) {
    return this.menuService.createKitchen(user, createKitchenDto);
  }

  @Patch('/kitchens/:id')
  updateKitchen(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Kitchen>,
  ) {
    return this.menuService.updateKitchen(user, id, updates);
  }

  @Delete('/kitchens/:id')
  deleteKitchen(@ReqUser() user: User, @Param('id') id: string) {
    return this.menuService.removeKitchen(user, id);
  }
}
