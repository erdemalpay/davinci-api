import { Controller, Get, Logger, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { HepsiburadaService } from './hepsiburada.service';

@Controller('hepsiburada')
export class HepsiburadaController {
  private readonly logger = new Logger(HepsiburadaController.name);

  constructor(private readonly hepsiburadaService: HepsiburadaService) {}

  @Public()
  @Get('/products')
  getAllProducts(
    @Query('barcode') barcode?: string,
    @Query('merchantSku') merchantSku?: string,
    @Query('hbSku') hbSku?: string,
  ) {
    return this.hepsiburadaService.getAllProducts(barcode, merchantSku, hbSku);
  }
}
