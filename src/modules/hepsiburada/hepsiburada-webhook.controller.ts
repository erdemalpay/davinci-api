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
    this.logger.log('Received Hepsiburada order webhook via /orders');
    this.logger.debug('Webhook data:', JSON.stringify(data, null, 2));
    return await this.hepsiburadaService.orderWebhook(data);
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
    this.logger.log(
      `Received Hepsiburada cancel webhook for line item: ${lineitemid}`,
    );
    this.logger.debug('Cancel data:', JSON.stringify(data, null, 2));
    return await this.hepsiburadaService.handleCancelOrder(data);
  }

  @Public()
  @Post('/packages')
  async createPackages(@Body() data?: any) {
    this.logger.log('Received Hepsiburada create packages webhook via /packages');
    this.logger.debug('Packages data:', JSON.stringify(data, null, 2));
    return { success: true };
  }

  @Public()
  @Put('/packages/:packagenumber/unpack')
  async unpackPackage(
    @Param('packagenumber') packagenumber: string,
    @Body() data?: any,
  ) {
    this.logger.log(`Received Hepsiburada unpack webhook for package: ${packagenumber}`);
    this.logger.debug('Unpack data:', JSON.stringify(data, null, 2));
    return { success: true };
  }

  @Public()
  @Put('/packages/:packagenumber/intransit')
  async intransitPackage(
    @Param('packagenumber') packagenumber: string,
    @Body() data?: any,
  ) {
    this.logger.log(`Received Hepsiburada intransit webhook for package: ${packagenumber}`);
    this.logger.debug('Intransit data:', JSON.stringify(data, null, 2));
    return { success: true };
  }

  @Public()
  @Put('/packages/:packagenumber/deliver')
  async deliverPackage(
    @Param('packagenumber') packagenumber: string,
    @Body() data?: any,
  ) {
    this.logger.log(`Received Hepsiburada deliver webhook for package: ${packagenumber}`);
    this.logger.debug('Deliver data:', JSON.stringify(data, null, 2));
    return { success: true };
  }

  @Public()
  @Put('/packages/:packagenumber/undeliver')
  async undeliverPackage(
    @Param('packagenumber') packagenumber: string,
    @Body() data?: any,
  ) {
    this.logger.log(`Received Hepsiburada undeliver webhook for package: ${packagenumber}`);
    this.logger.debug('Undeliver data:', JSON.stringify(data, null, 2));
    return { success: true };
  }

  @Public()
  @Put('/orders/:ordersnumber/shippingaddress')
  async changeShippingAddress(
    @Param('ordersnumber') ordersnumber: string,
    @Body() data?: any,
  ) {
    this.logger.log(`Received Hepsiburada shipping address change webhook for order: ${ordersnumber}`);
    this.logger.debug('Shipping address data:', JSON.stringify(data, null, 2));
    return { success: true };
  }

  @Public()
  @Put('/claims/awaitingaction')
  async claimsAwaitingAction(@Body() data?: any) {
    this.logger.log('Received Hepsiburada claims awaiting action webhook via /claims/awaitingaction');
    this.logger.debug('Claims awaiting action data:', JSON.stringify(data, null, 2));
    return { success: true };
  }

  @Public()
  @Put('/claims/accept')
  async claimsAccept(@Body() data?: any) {
    this.logger.log('Received Hepsiburada claims accept webhook via /claims/accept');
    this.logger.debug('Claims accept data:', JSON.stringify(data, null, 2));
    return { success: true };
  }

  @Public()
  @Put('/claims/reject')
  async claimsReject(@Body() data?: any) {
    this.logger.log('Received Hepsiburada claims reject webhook via /claims/reject');
    this.logger.debug('Claims reject data:', JSON.stringify(data, null, 2));
    return { success: true };
  }

  @Public()
  @Post('/claims/packages')
  async claimsPackages(@Body() data?: any) {
    this.logger.log('Received Hepsiburada claims packages webhook via /claims/packages');
    this.logger.debug('Claims packages data:', JSON.stringify(data, null, 2));
    return { success: true };
  }
}
