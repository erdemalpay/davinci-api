import { Body, Controller, Get, Logger, Post, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import {
  CreateTrendyolWebhookDto,
  GetTrendyolOrdersQueryDto,
  GetTrendyolProductsQueryDto,
} from './trendyol.dto';
import { TrendyolService } from './trendyol.service';

@Controller('trendyol')
export class TrendyolController {
  private readonly logger = new Logger(TrendyolController.name);

  constructor(private readonly trendyolService: TrendyolService) {}

  @Get('/order')
  getAllOrders(@Query() query: GetTrendyolOrdersQueryDto) {
    return this.trendyolService.getAllOrders(query);
  }

  @Get('/product')
  async getAllProducts(@Query() query: GetTrendyolProductsQueryDto) {
    try {
      this.logger.log('Fetching Trendyol products');
      return await this.trendyolService.getAllProducts(query);
    } catch (error) {
      this.logger.error('Error fetching products:', error);
      throw error;
    }
  }

  @Post('/webhook')
  async createWebhook(@Body() webhookData: CreateTrendyolWebhookDto) {
    try {
      this.logger.log('Creating Trendyol webhook');
      return await this.trendyolService.createWebhook(webhookData);
    } catch (error) {
      this.logger.error('Error creating webhook:', error);
      throw error;
    }
  }

  @Public()
  @Post('/order-create-webhook')
  async orderCreateWebhook(@Body() data?: any) {
    try {
      this.logger.log('Received Trendyol order create webhook');
      return await this.trendyolService.orderCreateWebhook(data);
    } catch (error) {
      this.logger.error('Error in order-create-webhook controller:', error);
      return { success: false, error: error?.message || 'Unknown error' };
    }
  }

  @Public()
  @Post('/order-status-webhook')
  async orderStatusWebhook(@Body() data?: any) {
    try {
      this.logger.log('Received Trendyol order status webhook');
      return await this.trendyolService.orderStatusWebhook(data);
    } catch (error) {
      this.logger.error('Error in order-status-webhook controller:', error);
      return { success: false, error: error?.message || 'Unknown error' };
    }
  }
}
