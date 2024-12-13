import { Controller, Get } from '@nestjs/common';
import { IkasService } from './ikas.service';

@Controller('ikas')
export class IkasController {
  constructor(private readonly ikasService: IkasService) {}

  @Get('/product')
  async getAllProducts() {
    return this.ikasService.getAllProducts();
  }
}
