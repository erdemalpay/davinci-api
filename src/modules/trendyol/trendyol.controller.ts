import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import {
  CreateTrendyolWebhookDto,
  GetTrendyolOrdersQueryDto,
  GetTrendyolProductsQueryDto,
  UpdatePriceAndInventoryItemDto,
} from './trendyol.dto';
import { TrendyolCronService } from './trendyol.cron.service';
import { TrendyolService } from './trendyol.service';

@Controller('trendy')
export class TrendyolController {
  constructor(
    private readonly trendyolService: TrendyolService,
    private readonly trendyolCronService: TrendyolCronService,
  ) {}

  @Get('/order')
  getAllOrders(@Query() query: GetTrendyolOrdersQueryDto) {
    return this.trendyolService.getAllOrders(query);
  }

  @Get('/product')
  async getAllProducts(@Query() query: GetTrendyolProductsQueryDto) {
    const products = await this.trendyolService.getAllProductsComplete(query);
    return {
      success: true,
      total: products.length,
      products,
    };
  }

  @Post('/product/update-price-and-inventory')
  async updatePriceAndInventory() {
    return await this.trendyolService.updatePriceAndInventory();
  }

  @Post('/product/update-inventory')
  async updateInventoryOnly() {
    return await this.trendyolService.updateInventoryOnly();
  }

  @Post('/product/update-price')
  async updatePriceOnly(
    @Body() body?: { items?: UpdatePriceAndInventoryItemDto[] },
  ) {
    return await this.trendyolService.updatePriceOnly(body?.items);
  }

  @Public()
  @Get('/webhook')
  getWebhooks() {
    return this.trendyolService.getWebhooks();
  }

  @Public()
  @Post('/webhook')
  createWebhook(@Body() webhookData: CreateTrendyolWebhookDto) {
    return this.trendyolService.createWebhook(webhookData);
  }

  @Public()
  @Delete('/webhook/:id')
  deleteWebhook(@Param('id') id: string) {
    return this.trendyolService.deleteWebhook(id);
  }

  @Public()
  @Post('/order-status-webhook')
  orderStatusWebhook(@Body() data?: any) {
    return this.trendyolService.orderStatusWebhook(data);
  }

  @Post('/process-accepted-claims')
  async processAcceptedClaims() {
    return await this.trendyolCronService.triggerManualClaimsProcessing();
  }
}
