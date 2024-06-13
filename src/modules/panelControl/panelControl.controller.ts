import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UpdateQuery } from 'mongoose';
import { ReqUser } from '../user/user.decorator';
import { User } from '../user/user.schema';
import { CheckoutCash } from './checkoutCash.schema';
import { Page } from './page.schema';
import { CreateCheckoutCashDto, CreatePageDto } from './panelControl.dto';
import { PanelControlService } from './panelControl.service';

@Controller('panel-control')
export class PanelControlController {
  constructor(private readonly panelControlService: PanelControlService) {}

  // Pages
  @Get('/pages')
  getPages() {
    return this.panelControlService.findAllPages();
  }

  @Post('/pages')
  createPage(@Body() createPageDto: CreatePageDto) {
    return this.panelControlService.createPage(createPageDto);
  }

  @Post('/pages/multiple')
  createMultiplePages(@Body() createPageDto: CreatePageDto[]) {
    return this.panelControlService.createMultiplePages(createPageDto);
  }

  @Patch('/pages/:id')
  updatePage(@Param('id') id: string, @Body() updates: UpdateQuery<Page>) {
    return this.panelControlService.updatePage(id, updates);
  }

  @Delete('/pages/:id')
  deletePage(@Param('id') id: string) {
    return this.panelControlService.removePage(id);
  }

  // Checkout Cash
  @Get('/checkout-cash')
  getCheckoutCash() {
    return this.panelControlService.findAllCheckoutCash();
  }

  @Post('/checkout-cash')
  createCheckoutCash(
    @ReqUser() user: User,
    @Body() createCheckoutCashDto: CreateCheckoutCashDto,
  ) {
    return this.panelControlService.createCheckoutCash(
      user,
      createCheckoutCashDto,
    );
  }

  @Delete('/checkout-cash/:id')
  deleteCheckoutCash(@Param('id') id: string) {
    return this.panelControlService.removeCheckoutCash(id);
  }

  @Patch('/checkout-cash/:id')
  updateCheckoutCash(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<CheckoutCash>,
  ) {
    return this.panelControlService.updateCheckoutCash(id, updates);
  }
}
