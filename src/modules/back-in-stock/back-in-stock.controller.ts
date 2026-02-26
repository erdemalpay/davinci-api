import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import {
  BackInStockQueryDto,
  CreateBackInStockSubscriptionDto,
  UnsubscribeByEmailDto,
  UpdateSubscriptionStatusDto,
} from './back-in-stock.dto';
import { BackInStockService } from './back-in-stock.service';

@Controller('/back-in-stock')
export class BackInStockController {
  constructor(private readonly backInStockService: BackInStockService) {}

  @Public()
  @Post('/subscribe')
  async subscribe(@Body() dto: CreateBackInStockSubscriptionDto) {
    return this.backInStockService.createSubscription(dto);
  }

  @Get('/query')
  async query(@Query() query: BackInStockQueryDto) {
    return this.backInStockService.getSubscriptions(query);
  }

  @Get('/:id')
  async getById(@Param('id') id: number) {
    return this.backInStockService.getSubscriptionById(id);
  }

  @Patch('/:id/status')
  async updateStatus(
    @Param('id') id: number,
    @Body() dto: UpdateSubscriptionStatusDto,
  ) {
    return this.backInStockService.updateSubscriptionStatus(id, dto);
  }

  @Public()
  @Delete('/cancel')
  async cancel(
    @Query('email') email: string,
    @Query('variantId') variantId: string,
  ) {
    return this.backInStockService.cancelSubscription(email, variantId);
  }

  @Get('/variant/:variantId')
  async getByVariant(@Param('variantId') variantId: string) {
    return this.backInStockService.getActiveSubscriptionsByVariant(variantId);
  }

  @Patch('/:id/notify')
  async markAsNotified(@Param('id') id: number) {
    return this.backInStockService.markAsNotified(id);
  }

  @Public()
  @Post('/unsubscribe')
  async unsubscribeByEmail(@Body() dto: UnsubscribeByEmailDto) {
    return this.backInStockService.unsubscribeByEmail(dto.email, dto.variantId);
  }
}
