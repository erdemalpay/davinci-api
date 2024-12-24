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

  @Public()
  @Post('/order-create-webhook')
  createOrderWebhook() {
    return this.ikasService.orderCreateWebHook();
  }
}
