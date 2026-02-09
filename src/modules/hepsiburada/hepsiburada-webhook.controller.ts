import { Body, Controller, Logger, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { HepsiburadaService } from './hepsiburada.service';

@Controller() // Root seviyede controller - prefix yok
export class HepsiburadaWebhookController {
  private readonly logger = new Logger(HepsiburadaWebhookController.name);

  constructor(private readonly hepsiburadaService: HepsiburadaService) {}

  // Hepsiburada'nın beklediği "/orders" endpoint'i
  // Base URL: api-staging.davinboardgame.com
  // Full URL: https://api-staging.davinboardgame.com/orders
  @Public()
  @Post('/orders')
  async orders(@Body() data?: any) {
    try {
      this.logger.log('Received Hepsiburada order webhook via /orders');
      this.logger.debug('Webhook data:', JSON.stringify(data, null, 2));
      return await this.hepsiburadaService.orderWebhook(data);
    } catch (error) {
      this.logger.error('Error in orders webhook controller:', error);
      return { success: false, error: error?.message || 'Unknown error' };
    }
  }
}
