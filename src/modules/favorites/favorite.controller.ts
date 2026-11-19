import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ShopifyAppProxy } from '../shopify/shopify-app-proxy.guard';
import {
  FavoriteItemDto,
  FavoriteProductsFilter,
  MergeFavoritesDto,
} from './favorite.dto';
import { FavoriteService, numericShopifyId } from './favorite.service';

// Panel
@Controller('favorites')
export class FavoriteController {
  constructor(private readonly favoriteService: FavoriteService) {}

  @Get('/summary')
  getSummary() {
    return this.favoriteService.getSummary();
  }

  @Get('/products')
  getTopProducts(@Query() filter: FavoriteProductsFilter) {
    return this.favoriteService.getTopProducts(filter);
  }

  @Get('/products/:productId/customers')
  getProductCustomers(@Param('productId') productId: string) {
    return this.favoriteService.getProductCustomers(productId);
  }

  @Get('/customers/:customerId')
  getCustomerFavorites(@Param('customerId') customerId: string) {
    const id = numericShopifyId(customerId);
    if (!id) {
      throw new HttpException('Invalid customer id', HttpStatus.BAD_REQUEST);
    }
    return this.favoriteService.getCustomerFavorites(id);
  }

  // ?customerIds=1,2,3 → { "1": 4, "3": 1 }
  @Get('/counts')
  getCounts(@Query('customerIds') customerIds?: string) {
    return this.favoriteService.getCountsByCustomer(
      (customerIds ?? '').split(',').filter(Boolean),
    );
  }
}

// Storefront, through the Shopify app proxy: kutuoyunual.com/apps/dv/favorites
@Controller('storefront/favorites')
export class FavoriteStorefrontController {
  constructor(private readonly favoriteService: FavoriteService) {}

  private proxyCustomerId(customerId?: string) {
    const id = numericShopifyId(customerId);
    if (!id) {
      throw new HttpException(
        'Favorilerini hesabına kaydetmek için giriş yapmalısın',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return id;
  }

  @ShopifyAppProxy()
  @Get()
  @Header('Content-Type', 'application/json')
  @Header('Cache-Control', 'no-store')
  list(
    @Query('logged_in_customer_id') customerId?: string,
    @Query('refresh') refresh?: string,
  ) {
    return this.favoriteService.getStorefrontList(
      this.proxyCustomerId(customerId),
      refresh === '1' || refresh === 'true',
    );
  }

  @ShopifyAppProxy()
  @Post('/add')
  @Header('Content-Type', 'application/json')
  @Header('Cache-Control', 'no-store')
  add(
    @Query('logged_in_customer_id') customerId: string,
    @Body() dto: FavoriteItemDto,
  ) {
    return this.favoriteService.add(this.proxyCustomerId(customerId), dto);
  }

  @ShopifyAppProxy()
  @Post('/remove')
  @Header('Content-Type', 'application/json')
  @Header('Cache-Control', 'no-store')
  remove(
    @Query('logged_in_customer_id') customerId: string,
    @Body() dto: FavoriteItemDto,
  ) {
    return this.favoriteService.remove(this.proxyCustomerId(customerId), dto);
  }

  @ShopifyAppProxy()
  @Post('/merge')
  @Header('Content-Type', 'application/json')
  @Header('Cache-Control', 'no-store')
  merge(
    @Query('logged_in_customer_id') customerId: string,
    @Body() dto: MergeFavoritesDto,
  ) {
    return this.favoriteService.merge(
      this.proxyCustomerId(customerId),
      dto?.items,
    );
  }
}
