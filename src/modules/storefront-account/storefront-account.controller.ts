import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { numericShopifyId } from '../favorites/favorite.service';
import { ShopifyAppProxy } from '../shopify/shopify-app-proxy.guard';
import { SaveAddressDto, UpdateProfileDto } from './storefront-account.dto';
import { StorefrontAccountService } from './storefront-account.service';
import { StorefrontReviewsService } from './storefront-reviews.service';

// kutuoyunual.com/apps/dv/account/* → "Profilim" page edits.
// The customer is whoever Shopify signed the request for (logged_in_customer_id);
// every write is scoped to that customer. Email can't be changed here: it is
// the login for Shopify customer accounts.
@Controller('storefront/account')
export class StorefrontAccountController {
  constructor(
    private readonly accountService: StorefrontAccountService,
    private readonly reviewsService: StorefrontReviewsService,
  ) {}

  private customerId(value?: string) {
    const id = numericShopifyId(value);
    if (!id) {
      throw new HttpException(
        'Bu işlem için giriş yapmalısın.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return id;
  }

  @ShopifyAppProxy()
  @Post('/profile')
  @HttpCode(200)
  @Header('Content-Type', 'application/json')
  @Header('Cache-Control', 'no-store')
  updateProfile(
    @Query('logged_in_customer_id') customerId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.accountService.updateProfile(this.customerId(customerId), dto);
  }

  @ShopifyAppProxy()
  @Post('/addresses')
  @HttpCode(200)
  @Header('Content-Type', 'application/json')
  @Header('Cache-Control', 'no-store')
  createAddress(
    @Query('logged_in_customer_id') customerId: string,
    @Body() dto: SaveAddressDto,
  ) {
    return this.accountService.createAddress(this.customerId(customerId), dto);
  }

  @ShopifyAppProxy()
  @Post('/addresses/:addressId')
  @HttpCode(200)
  @Header('Content-Type', 'application/json')
  @Header('Cache-Control', 'no-store')
  updateAddress(
    @Query('logged_in_customer_id') customerId: string,
    @Param('addressId') addressId: string,
    @Body() dto: SaveAddressDto,
  ) {
    return this.accountService.updateAddress(
      this.customerId(customerId),
      addressId,
      dto,
    );
  }

  @ShopifyAppProxy()
  @Post('/addresses/:addressId/delete')
  @HttpCode(200)
  @Header('Content-Type', 'application/json')
  @Header('Cache-Control', 'no-store')
  deleteAddress(
    @Query('logged_in_customer_id') customerId: string,
    @Param('addressId') addressId: string,
  ) {
    return this.accountService.deleteAddress(
      this.customerId(customerId),
      addressId,
    );
  }

  @ShopifyAppProxy()
  @Post('/addresses/:addressId/default')
  @HttpCode(200)
  @Header('Content-Type', 'application/json')
  @Header('Cache-Control', 'no-store')
  setDefaultAddress(
    @Query('logged_in_customer_id') customerId: string,
    @Param('addressId') addressId: string,
  ) {
    return this.accountService.setDefaultAddress(
      this.customerId(customerId),
      addressId,
    );
  }

  // The customer's own Judge.me reviews ("Yorumlarım" on Profilim).
  @ShopifyAppProxy()
  @Get('/reviews')
  @Header('Content-Type', 'application/json')
  @Header('Cache-Control', 'no-store')
  getMyReviews(@Query('logged_in_customer_id') customerId: string) {
    return this.reviewsService.getMyReviews(this.customerId(customerId));
  }
}
