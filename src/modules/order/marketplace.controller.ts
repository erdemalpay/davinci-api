import { Body, Get, Post } from '@nestjs/common';
import { MarketplaceCron } from './marketplace-cron';
import { MatchMarketplaceItemsDto } from './marketplace.dto';

type MarketplaceProductService = {
  getAllProducts(): Promise<unknown[]>;
  updateAllStocks(): Promise<unknown>;
  updateAllPrices(): Promise<unknown>;
  matchItemsByBarcode(itemIds: number[]): Promise<unknown>;
};

// n11 ve idefix'in ortak uçları; yol öneki alt sınıfın @Controller'ından gelir
// (ör. /n11/products, /idefix/products).
export abstract class MarketplaceController {
  constructor(
    private readonly productService: MarketplaceProductService,
    private readonly cronService: MarketplaceCron,
  ) {}

  @Get('/products')
  getAllProducts() {
    return this.productService.getAllProducts();
  }

  @Post('/update-all-stocks')
  updateAllStocks() {
    return this.productService.updateAllStocks();
  }

  @Post('/update-all-prices')
  updateAllPrices() {
    return this.productService.updateAllPrices();
  }

  @Post('/match-items-by-barcode')
  matchItemsByBarcode(@Body() body: MatchMarketplaceItemsDto) {
    return this.productService.matchItemsByBarcode(body.itemIds);
  }

  @Post('/sync-orders')
  syncOrders() {
    return this.cronService.triggerManualOrderSync();
  }

  @Post('/process-accepted-claims')
  processAcceptedClaims() {
    return this.cronService.triggerManualClaimsProcessing();
  }
}
