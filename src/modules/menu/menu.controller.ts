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

  @Get('/items/ikas')
  findItemsWithIkasId() {
    return this.menuService.findItemsWithIkasId();
  }

  @Post('/items/update-ikas-id')
  updateIkasItemsIkasIdFields(@Body() sendItems: Array<MenuItem>) {
    return this.menuService.updateIkasItemsIkasIdFields(sendItems);
  }

  @Post('/items/update-ikas-variant-ids')
  updateIkasVariantIds() {
    return this.menuService.updateIkasVariantIds();
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
  getUndeletedItems() {
    return this.menuService.findAllUndeletedItems();
  }

  @Get('/items/all')
  getAllItems() {
    return this.menuService.findAllItems();
  }

  @Public()
  @Get('/items/oyun-al')
  findOyunAlItems() {
    return this.menuService.findOyunAlItems();
  }

  @Post('/categories')
  createCategory(@Body() createCategoryDto: CreateCategoryDto) {
    return this.menuService.createCategory(createCategoryDto);
  }

  @Post('/items')
  createItem(@ReqUser() user: User, @Body() createItemDto: CreateItemDto) {
    return this.menuService.createItem(user, createItemDto);
  }
  @Post('/items/remove-dublicates-price-history')
  removeDublicatesPriceHistory() {
    return this.menuService.removeDublicatesPriceHistory();
  }

  @Post('/items/slug')
  updateItemsSlugs() {
    return this.menuService.updateItemsSlugs();
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

  @Post('/items/migrate-suggested-discount')
  migrateSuggestedDiscount() {
    return this.menuService.migrateSuggestedDiscounts();
  }

  @Post('/items/ikas/sync-all-prices')
  syncAllIkasPrices() {
    return this.menuService.syncAllIkasPrices();
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
  @Patch('/categories-kitchen/:id')
  updateFarmCategory(
    @ReqUser() user: User,
    @Param('id') id: number,
    @Body() updates: UpdateQuery<MenuCategory>,
  ) {
    return this.menuService.updateKitchenCategory(user, id, updates);
  }

  @Post('/categories/set-order-category')
  setOrderCategory() {
    return this.menuService.setOrderCategoryOrders();
  }

  @Patch('/categories/:id')
  updateCategory(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<MenuCategory>,
  ) {
    return this.menuService.updateCategory(id, updates);
  }
  @Patch('/categories_order/:id')
  updateCategoriesOrder(
    @Param('id') id: number,
    @Body()
    payload: {
      newOrder: number;
    },
  ) {
    return this.menuService.updateCategoriesOrder(id, payload.newOrder);
  }

  @Patch('/order_categories_order/:id')
  updateOrderCategoriesOrder(
    @Param('id') id: number,
    @Body()
    payload: {
      newOrder: number;
    },
  ) {
    return this.menuService.updateOrderCategoriesOrder(id, payload.newOrder);
  }

  @Patch('/items_order/:id')
  updateItemsOrder(
    @Param('id') id: number,
    @Body()
    payload: {
      newOrder: number;
    },
  ) {
    return this.menuService.updateItemsOrder(id, payload.newOrder);
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
  deleteCategory(@ReqUser() @Param('id') id: number) {
    return this.menuService.removeCategory(id);
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
  // kitchen
  @Get('/kitchens')
  getKitchens() {
    return this.menuService.findAllKitchens();
  }

  @Post('/kitchens')
  createKitchen(@Body() createKitchenDto: CreateKitchenDto) {
    return this.menuService.createKitchen(createKitchenDto);
  }

  @Patch('/kitchens/:id')
  updateKitchen(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Kitchen>,
  ) {
    return this.menuService.updateKitchen(id, updates);
  }

  @Delete('/kitchens/:id')
  deleteKitchen(@Param('id') id: string) {
    return this.menuService.removeKitchen(id);
  }

  //upper category
  @Get('/upper_categories')
  getUpperCategories() {
    return this.menuService.findAllUpperCategories();
  }

  @Post('/upper_categories')
  createUpperCategory(@Body() createUpperCategoryDto: CreateUpperCategoryDto) {
    return this.menuService.createUpperCategory(createUpperCategoryDto);
  }

  @Patch('/upper_categories/:id')
  updateUpperCategory(
    @Param('id') id: number,
    @Body() updates: UpdateQuery<UpperCategory>,
  ) {
    return this.menuService.updateUpperCategory(id, updates);
  }

  @Delete('/upper_categories/:id')
  deleteUpperCategory(@ReqUser() @Param('id') id: number) {
    return this.menuService.removeUpperCategory(id);
  }
}
