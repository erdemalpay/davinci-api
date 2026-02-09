import { Body, Controller, Logger, Post, Put, Param } from '@nestjs/common';
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

  // Hepsiburada'nın beklediği "/lineitems/{lineitemid}/cancel" endpoint'i
  // Base URL: api-staging.davinboardgame.com
  // Full URL: https://api-staging.davinboardgame.com/lineitems/{lineitemid}/cancel
  @Public()
  @Put('/lineitems/:lineitemid/cancel')
  async cancelLineItem(
    @Param('lineitemid') lineitemid: string,
    @Body() data?: any,
  ) {
    try {
      this.logger.log(
        `Received Hepsiburada cancel webhook for line item: ${lineitemid}`,
      );
      this.logger.debug('Cancel data:', JSON.stringify(data, null, 2));
      return await this.hepsiburadaService.handleCancelOrder(data);
    } catch (error) {
      this.logger.error('Error in cancel webhook controller:', error);
      return { success: false, error: error?.message || 'Unknown error' };
    }
  }
}
