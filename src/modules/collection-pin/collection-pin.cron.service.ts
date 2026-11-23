import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CAFE_TIME_ZONE } from 'src/utils/cafeTime';
import { CollectionPinService } from './collection-pin.service';

@Injectable()
export class CollectionPinCronService {
  private readonly logger = new Logger(CollectionPinCronService.name);

  constructor(private readonly collectionPinService: CollectionPinService) {}

  // Once a day, so games added to "Da Vinci Oyunları" move to the top. Staging
  // talks to the same Shopify store, so only production does it.
  @Cron('0 0 5 * * *', { timeZone: CAFE_TIME_ZONE })
  async pinDaVinciGames() {
    if (process.env.NODE_ENV !== 'production') return;
    try {
      await this.collectionPinService.pinDaVinciGames();
    } catch (error) {
      this.logger.error('Failed to pin Da Vinci games', error);
    }
  }
}
