import { Controller, Get, Post } from '@nestjs/common';
import { PriceCompareCronService } from './price-compare.cron.service';
import { PriceCompareService } from './price-compare.service';

@Controller('/price-compare')
export class PriceCompareController {
  constructor(
    private readonly priceCompareService: PriceCompareService,
    private readonly priceCompareCronService: PriceCompareCronService,
  ) {}

  @Get('local-comparison/hashmap')
  async getLocalComparisonHashmap() {
    return this.priceCompareService.fetchLocalComparisonHashmap();
  }

  //   @Public()
  //   @Get('/neotroy')
  //   async getNeotroyItems() {
  //     return this.priceCompareService.fetchNeotroyItems();
  //   }

  //   @Public()
  //   @Get('/neotroy/hashmap')
  //   async getNeotroyHashmap() {
  //     return this.priceCompareService.fetchNeotroyHashmap();
  //   }

  //   @Public()
  //   @Get('/kutugo')
  //   async getKutugoItems() {
  //     return this.priceCompareService.fetchKutugoItems();
  //   }

  //   @Public()
  //   @Get('/kutugo/hashmap')
  //   async getKutugoHashmap() {
  //     return this.priceCompareService.fetchKutugoHashmap();
  //   }

  //   @Public()
  //   @Get('/davinci')
  //   async getDaVinciItems() {
  //     return this.priceCompareService.fetchDaVinciItems();
  //   }

  //   @Public()
  //   @Get('/davinci/hashmap')
  //   async getDaVinciHashmap() {
  //     return this.priceCompareService.fetchDaVinciHashmap();
  //   }

  //   @Public()
  //   @Get('/d20tabletop')
  //   async getD20TabletopItems() {
  //     return this.priceCompareService.fetchD20TabletopItems();
  //   }

  //   @Public()
  //   @Get('/d20tabletop/hashmap')
  //   async getD20TabletopHashmap() {
  //     return this.priceCompareService.fetchD20TabletopHashmap();
  //   }

  //   @Public()
  //   @Get('/goblin')
  //   async getGoblinItems() {
  //     return this.priceCompareService.fetchGoblinItems();
  //   }

  //   @Public()
  //   @Get('/goblin/hashmap')
  //   async getGoblinHashmap() {
  //     return this.priceCompareService.fetchGoblinHashmap();
  //   }

  //   @Public()
  //   @Get('/simurg')
  //   async getSimurgItems() {
  //     return this.priceCompareService.fetchSimurgItems();
  //   }

  //   @Public()
  //   @Get('/simurg/hashmap')
  //   async getSimurgHashmap() {
  //     return this.priceCompareService.fetchSimurgHashmap();
  //   }

  @Post('/sync-local-comparison')
  async triggerLocalComparisonSync() {
    return this.priceCompareCronService.triggerManualSync();
  }
}
