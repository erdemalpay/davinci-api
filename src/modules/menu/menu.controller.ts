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
  CreateUpperCategoryDto,
} from './menu.dto';
import { MenuService } from './menu.service';
import { UpperCategory } from './upperCategory.schema';

@Controller('/menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Public()
  @Get('/categories')
  getActiveCategories() {
    return this.menuService.findActiveCategories();
  }
  @Get('/items/update-ikas-categories')
  updateItemIkasCategories() {
    return this.menuService.updateItemIkasCategories();
  }

  @Get('/items/remove-deleted-products')
  removeDeletedProducts() {
    return this.menuService.removeDeletedProductsFromMenuItem();
  }

  @Get('/categories-all')
  getAllCategories() {
    return this.menuService.findAllCategories();
  }
  @Get('/update-category-active')
  updateCategoriesActiveness() {
    return this.menuService.updateCategoriesActiveness();
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

  @Post('/items/create-ikas-products')
  createIkasProducts(
    @ReqUser() user: User,
    @Body()
    payload: {
      itemIds: Array<number>;
    },
  ) {
    return this.menuService.createMultipleIkasProduct(user, payload.itemIds);
  }

  @Post('/items/create-damaged-item')
  createDamagedItem(
    @ReqUser() user: User,
    @Body()
    payload: {
      itemId: number;
      stockQuantity: number;
      price: number;
      category: number;
      name: string;
      oldStockLocation: number;
      newStockLocation: number;
    },
  ) {
    return this.menuService.createDamagedItem(
      user,
      payload.itemId,
      payload.stockQuantity,
      payload.price,
      payload.category,
      payload.name,
      payload.oldStockLocation,
      payload.newStockLocation,
    );
  }
  // this is for the bulk update of items in menu page
  @Post('/items/update-bulk-items')
  updateBulkItems(
    @ReqUser() user: User,
    @Body()
    payload: {
      itemIds: number[];
      updates: UpdateQuery<MenuItem>;
    },
  ) {
    return this.menuService.updateBulkItems(
      user,
      payload.itemIds,
      payload.updates,
    );
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
  @Patch('/categories_order/:id')
  updateCategoriesOrder(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body()
    payload: {
      newOrder: number;
    },
  ) {
    return this.menuService.updateCategoriesOrder(user, id, payload.newOrder);
  }

  @Patch('/items_order/:id')
  updateItemsOrder(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body()
    payload: {
      newOrder: number;
    },
  ) {
    return this.menuService.updateItemsOrder(user, id, payload.newOrder);
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

  //upper category
  @Get('/upper_categories')
  getUpperCategories() {
    return this.menuService.findAllUpperCategories();
  }

  @Post('/upper_categories')
  createUpperCategory(
    @ReqUser() user: User,
    @Body() createUpperCategoryDto: CreateUpperCategoryDto,
  ) {
    return this.menuService.createUpperCategory(user, createUpperCategoryDto);
  }

  @Patch('/upper_categories/:id')
  updateUpperCategory(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<UpperCategory>,
  ) {
    return this.menuService.updateUpperCategory(user, id, updates);
  }

  @Delete('/upper_categories/:id')
  deleteUpperCategory(@ReqUser() user: User, @Param('id') id: number) {
    return this.menuService.removeUpperCategory(user, id);
  }
}
