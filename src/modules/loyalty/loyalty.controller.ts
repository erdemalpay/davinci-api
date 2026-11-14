import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import {
  AdjustLoyaltyPointsDto,
  LoyaltyAccountFilter,
  LoyaltyCouponFilter,
  LoyaltyTransactionFilter,
  RedeemLoyaltyPointsDto,
  UpdateLoyaltySettingsDto,
} from './loyalty.dto';
import { customerIdFromGid, LoyaltyService } from './loyalty.service';
import { ShopifyAppProxy } from './shopify-app-proxy.guard';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  // ---- storefront, through the Shopify app proxy (kutuoyunual.com/apps/puan)

  private proxyCustomerId(customerId?: string) {
    const id = customerIdFromGid(customerId);
    if (!id) {
      throw new HttpException(
        'Puanlarını görmek için giriş yapmalısın',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return id;
  }

  @ShopifyAppProxy()
  @Get('/proxy')
  @Header('Content-Type', 'application/json')
  @Header('Cache-Control', 'no-store')
  getProxyOverview(@Query('logged_in_customer_id') customerId?: string) {
    return this.loyaltyService.getCustomerOverview(
      this.proxyCustomerId(customerId),
    );
  }

  @ShopifyAppProxy()
  @Post('/proxy/redeem')
  @Header('Content-Type', 'application/json')
  @Header('Cache-Control', 'no-store')
  redeemFromProxy(
    @Query('logged_in_customer_id') customerId: string,
    @Body() dto: RedeemLoyaltyPointsDto,
  ) {
    return this.loyaltyService.redeem(
      this.proxyCustomerId(customerId),
      dto?.amount,
    );
  }

  // ---- panel

  @Get('/settings')
  getSettings() {
    return this.loyaltyService.getSettings();
  }

  @Patch('/settings')
  updateSettings(@ReqUser() user: User, @Body() dto: UpdateLoyaltySettingsDto) {
    return this.loyaltyService.updateSettings(user, dto);
  }

  @Get('/summary')
  getSummary() {
    return this.loyaltyService.getSummary();
  }

  @Get('/accounts')
  findAccounts(@Query() filter: LoyaltyAccountFilter) {
    return this.loyaltyService.findAccounts(filter);
  }

  @Get('/accounts/:shopifyCustomerId')
  findAccountDetail(@Param('shopifyCustomerId') shopifyCustomerId: string) {
    return this.loyaltyService.findAccountDetail(shopifyCustomerId);
  }

  @Post('/accounts/:shopifyCustomerId/adjust')
  adjustPoints(
    @ReqUser() user: User,
    @Param('shopifyCustomerId') shopifyCustomerId: string,
    @Body() dto: AdjustLoyaltyPointsDto,
  ) {
    return this.loyaltyService.adjustPoints(user, shopifyCustomerId, dto);
  }

  @Get('/transactions')
  findTransactions(@Query() filter: LoyaltyTransactionFilter) {
    return this.loyaltyService.findTransactions(filter);
  }

  @Get('/coupons')
  findCoupons(@Query() filter: LoyaltyCouponFilter) {
    return this.loyaltyService.findCoupons(filter);
  }
}
