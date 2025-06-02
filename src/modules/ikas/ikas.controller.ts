import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { IkasService } from './ikas.service';

@Controller('ikas')
export class IkasController {
  constructor(private readonly ikasService: IkasService) {}

  @Get('/product')
  getAllProducts() {
    return this.ikasService.getAllProducts();
  }

  @Get('/order')
  getAllOrders() {
    return this.ikasService.getAllOrders();
  }

  @Post('/product')
  createProduct(@Body() product: any) {
    return this.ikasService.createProduct(product);
  }

  @Patch('/product-stock')
  updateProductStock(
    @Body()
    payload: {
      productId: string;
      stockLocationId: number;
      stockCount: number;
    },
  ) {
    return this.ikasService.updateProductStock(
      payload.productId,
      payload.stockLocationId,
      payload.stockCount,
    );
  }

  @Patch('/product-price')
  updateProductPrice(
    @Body()
    payload: {
      productId: string;
      newPrice: number;
    },
  ) {
    return this.ikasService.updateProductPrice(
      payload.productId,
      payload.newPrice,
    );
  }

  @Get('/category')
  getAllCategories() {
    return this.ikasService.getAllCategories();
  }

  @Get('/stock-location')
  getAllStockLocations() {
    return this.ikasService.getAllStockLocations();
  }
  @Get('/sales-channel')
  getAllSalesChannels() {
    return this.ikasService.getAllSalesChannels();
  }

  @Get('/price-list')
  getAllPriceLists() {
    return this.ikasService.getAllPriceLists();
  }

  @Get('/webhook')
  getAllWebhooks() {
    return this.ikasService.getAllWebhooks();
  }

  @Post('/create-order')
  createOrderWebhooks() {
    return this.ikasService.createOrderWebhook();
  }

  @Post('/delete-webhook')
  deleteWebhook(@Body() scopes: string[]) {
    return this.ikasService.deleteWebhook(scopes);
  }

  @Post('/update-all-stocks')
  bulkUpdateAllProductStocksAndPrices() {
    return this.ikasService.bulkUpdateAllProductStocksAndPrices();
  }

  @Public()
  @Post('/order-create-webhook')
  createOrderWebhook(@Body() data?: any) {
    return this.ikasService.orderCreateWebHook(data);
  }

  @Public()
  @Post('/order-cancel-webhook')
  orderCancelWebHook(@Body() data?: any) {
    return this.ikasService.orderCancelWebHook(data);
  }
}
