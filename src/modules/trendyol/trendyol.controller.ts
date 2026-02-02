import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Logger,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import {
  CreateTrendyolWebhookDto,
  GetTrendyolOrdersQueryDto,
  GetTrendyolProductsQueryDto,
} from './trendyol.dto';
import { TrendyolService } from './trendyol.service';

@Controller('trendy')
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

  @Public()
  @Get('/webhook')
  async getWebhooks() {
    try {
      this.logger.log('Fetching Trendyol webhooks');
      return await this.trendyolService.getWebhooks();
    } catch (error) {
      this.logger.error('Error fetching webhooks:', error);
      throw error;
    }
  }

  @Public()
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
  @Delete('/webhook/:id')
  async deleteWebhook(@Param('id') id: string) {
    try {
      this.logger.log(`Deleting Trendyol webhook: ${id}`);
      return await this.trendyolService.deleteWebhook(id);
    } catch (error) {
      this.logger.error('Error deleting webhook:', error);
      throw error;
    }
  }

  @Public()
  @Get('/order-create-webhook')
  async orderCreateWebhookVerification(
    @Headers() headers: any,
    @Query() query: any,
    @Req() req: any,
  ) {
    this.logger.log('Trendyol webhook verification (GET request)');
    this.logger.log('Headers:', JSON.stringify(headers, null, 2));
    this.logger.log('Query params:', JSON.stringify(query, null, 2));
    this.logger.log('Request URL:', req.url);
    return { success: true, message: 'Webhook endpoint is ready' };
  }

  @Public()
  @Post('/order-create-webhook')
  async orderCreateWebhook(@Body() data?: any, @Headers() headers?: any) {
    try {
      this.logger.log('Received Trendyol order create webhook (POST)');
      this.logger.log('Headers:', JSON.stringify(headers, null, 2));
      this.logger.log('Body:', JSON.stringify(data, null, 2));
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
