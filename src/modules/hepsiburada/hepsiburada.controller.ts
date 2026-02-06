import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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

  @Public()
  @Get('/products-by-status')
  getProductsByStatus(
    @Query('productStatus') productStatus?: string,
    @Query('taskStatus') taskStatus?: string,
    @Query('version') version?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.hepsiburadaService.getProductsByStatus(
      productStatus || 'MATCHED',
      taskStatus === 'true' ? true : taskStatus === 'false' ? false : undefined,
      version ? parseInt(version) : 1,
      page ? parseInt(page) : 0,
      size ? parseInt(size) : 1000,
    );
  }

  @Patch('/product-price')
  updateProductPrice(
    @Body()
    payload: {
      hepsiburadaSku?: string;
      merchantSku?: string;
      price?: number;
    },
  ) {
    return this.hepsiburadaService.updateProductPrice(
      payload.hepsiburadaSku,
      payload.merchantSku,
      payload.price,
    );
  }

  @Get('/price-update-status/:batchId')
  checkPriceUpdateStatus(@Param('batchId') batchId: string) {
    return this.hepsiburadaService.checkPriceUpdateStatus(batchId);
  }

  @Get('/listings')
  getListings(@Query('page') page?: string, @Query('size') size?: string) {
    return this.hepsiburadaService.getListings(
      page ? parseInt(page) : 0,
      size ? parseInt(size) : 1000,
    );
  }

  @Get('/inventory-upload-status/:inventoryUploadId')
  checkInventoryUploadStatus(
    @Param('inventoryUploadId') inventoryUploadId: string,
  ) {
    return this.hepsiburadaService.checkInventoryUploadStatus(
      inventoryUploadId,
    );
  }

  @Post('/update-all-prices')
  updateAllItemPrices() {
    return this.hepsiburadaService.updateAllItemPrices();
  }
}
