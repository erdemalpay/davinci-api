import { Body, Controller, Delete, Get, Logger, Param, Patch, Post, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { CreateOrderDiscountDto, UpdateOrderDiscountDto } from './shopify.dto';
import { ShopifyService } from './shopify.service';

@Controller('shopify')
export class ShopifyController {
  private readonly logger = new Logger(ShopifyController.name);

  constructor(private readonly shopifyService: ShopifyService) {}

  @Public()
  @Get('/games')
  getGamesForWebSite() {
    return this.shopifyService.getGamesForWebSite();
  }

  @Get('/product')
  getAllProducts() {
    return this.shopifyService.getAllProducts();
  }

  @Get('/order')
  getAllOrders() {
    return this.shopifyService.getAllOrders();
  }

  @Post('/product')
  createProduct(@Body() product: any) {
    return this.shopifyService.createProduct(product);
  }

  @Post('/product-image')
  updateProductImages(
    @Body()
    payload: {
      itemId: number;
    },
  ) {
    return this.shopifyService.updateProductImages(payload.itemId);
  }

  @Patch('/product-stock')
  updateProductStock(
    @Body()
    payload: {
      variantId: string;
      stockLocationId: number;
      stockCount: number;
    },
  ) {
    return this.shopifyService.updateProductStock(
      payload.variantId,
      payload.stockLocationId,
      payload.stockCount,
    );
  }

  @Patch('/product-price')
  updateProductPrice(
    @Body()
    payload: {
      productId: string;
      variantId: string;
      newPrice: number;
    },
  ) {
    return this.shopifyService.updateProductPrice(
      payload.productId,
      payload.variantId,
      payload.newPrice,
    );
  }

  @Get('/customer')
  getCustomersPaginated(
    @Query('page') page = '1',
    @Query('limit') limit = '100',
    @Query('search') search?: string,
  ) {
    return this.shopifyService.getCustomersPaginated(
      parseInt(page, 10),
      parseInt(limit, 10),
      search,
    );
  }

  @Post('/customer/refresh')
  refreshCustomerCache() {
    return this.shopifyService.refreshCustomerCache();
  }

  @Get('/collection')
  getAllCollections() {
    return this.shopifyService.getAllCollections();
  }

  @Get('/location')
  getAllLocations() {
    return this.shopifyService.getAllLocations();
  }

  @Get('/webhook')
  getAllWebhooks() {
    return this.shopifyService.getAllWebhooks();
  }

  @Post('/webhook')
  createWebhook(
    @Body()
    payload: {
      callbackUrl: string;
      topic: string;
    },
  ) {
    return this.shopifyService.createWebhook(
      payload.callbackUrl,
      payload.topic,
    );
  }

  @Post('/update-all-stocks')
  updateAllProductStocks() {
    return this.shopifyService.updateAllProductStocks();
  }

  @Public()
  @Post('/order-create-webhook')
  createOrderWebhook(@Body() data?: any) {
    // Shopify 5 sn içinde 200 alamazsa retry yapıyor ve duplike sipariş oluşuyor.
    // Hemen 200 dönüp işlemi arka planda yapıyoruz.
    // Duplike koruması Order koleksiyonundaki shopifyOrderLineItemId unique index ile sağlanıyor.
    this.shopifyService.orderCreateWebHook(data).catch((error) => {
      this.logger.error('Error in order-create-webhook background processing:', error);
    });
    return { received: true };
  }

  @Public()
  @Post('/order-cancel-webhook')
  orderCancelWebHook(@Body() data?: any) {
    return this.shopifyService.orderCancelWebHook(data);
  }

  @Get('/discount')
  getDiscounts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    if (pageNum && limitNum) {
      return this.shopifyService.getDiscountsPaginated(pageNum, limitNum, search, status);
    }
    return this.shopifyService.getDiscounts();
  }

  @Post('/discount')
  createOrderDiscount(@Body() dto: CreateOrderDiscountDto) {
    return this.shopifyService.createOrderDiscount(dto);
  }

  @Patch('/discount')
  updateOrderDiscount(@Body() dto: UpdateOrderDiscountDto) {
    return this.shopifyService.updateOrderDiscount(dto);
  }

  @Delete('/discount/:id')
  deleteDiscount(@Param('id') id: string) {
    return this.shopifyService.deleteDiscount(id);
  }
}
