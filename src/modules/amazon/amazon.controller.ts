import { Body, Controller, Post } from '@nestjs/common';
import { MatchMarketplaceItemsDto } from '../order/marketplace.dto';
import { AmazonCronService } from './amazon.cron.service';
import { AmazonService } from './amazon.service';

@Controller('amazon')
export class AmazonController {
  constructor(
    private readonly amazonService: AmazonService,
    private readonly amazonCronService: AmazonCronService,
  ) {}

  @Post('/match-items-by-barcode')
  matchItemsByBarcode(@Body() body: MatchMarketplaceItemsDto) {
    return this.amazonService.matchItemsByBarcode(body.itemIds);
  }

  @Post('/sync-orders')
  syncOrders() {
    return this.amazonCronService.triggerManualOrderSync();
  }

  @Post('/process-accepted-claims')
  processAcceptedClaims() {
    return this.amazonCronService.triggerManualClaimsProcessing();
  }
}
