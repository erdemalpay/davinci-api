import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ShopifyService } from './shopify.service';

@Controller('shopify')
export class ShopifyController {
  constructor(private readonly shopifyService: ShopifyService) {}

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
  async createOrderWebhook(@Body() data?: any) {
    try {
      let i = 0;
      console.log('Received Shopify order webhook data:', i++);
      return await this.shopifyService.orderCreateWebHook(data);
    } catch (error) {
      console.error('Error in order-create-webhook controller:', error);
      return { success: false, error: error?.message || 'Unknown error' };
    }
  }

  @Public()
  @Post('/order-cancel-webhook')
  orderCancelWebHook(@Body() data?: any) {
    return this.shopifyService.orderCancelWebHook(data);
  }
}
