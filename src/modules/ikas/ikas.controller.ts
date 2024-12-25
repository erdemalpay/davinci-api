import { Body, Controller, Get, Post } from '@nestjs/common';
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

  @Get('/category')
  getAllCategories() {
    return this.ikasService.getAllCategories();
  }

  @Get('/stock-location')
  getAllStockLocations() {
    return this.ikasService.getAllStockLocations();
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

  @Public()
  @Post('/order-create-webhook')
  createOrderWebhook(@Body() data?: any) {
    return this.ikasService.orderCreateWebHook(data);
  }
}
