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
  updateAllStocks() {
    return this.ikasService.updateAllProductStocks();
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
