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
import { Cashout } from './cashout.schema';
import {
  CreateCashoutDto,
  CreateCheckoutControlDto,
  CreateIncomeDto,
} from './checkout.dto';
import { CheckoutService } from './checkout.service';
import { CheckoutControl } from './checkoutControl.schema';
import { Income } from './income.schema';

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}
  // Income
  @Get('/income')
  getIncome() {
    return this.checkoutService.findAllIncome();
  }

  @Post('/income')
  createIncome(
    @ReqUser() user: User,
    @Body() createIncomeDto: CreateIncomeDto,
  ) {
    return this.checkoutService.createIncome(user, createIncomeDto);
  }

  @Patch('/income/:id')
  updateIncome(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Income>,
  ) {
    return this.checkoutService.updateIncome(user, id, updates);
  }

  @Delete('/income/:id')
  deleteIncome(@ReqUser() user: User, @Param('id') id: string) {
    return this.checkoutService.removeIncome(user, id);
  }
  // Cashout
  @Get('/cashout')
  getCashout() {
    return this.checkoutService.findAllCashout();
  }

  @Post('/cashout')
  createCashout(
    @ReqUser() user: User,
    @Body() createCashoutDto: CreateCashoutDto,
  ) {
    return this.checkoutService.createCashout(user, createCashoutDto);
  }

  @Patch('/cashout/:id')
  updateCashout(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Cashout>,
  ) {
    return this.checkoutService.updateCashout(user, id, updates);
  }

  @Delete('/cashout/:id')
  deleteCashout(@ReqUser() user: User, @Param('id') id: string) {
    return this.checkoutService.removeCashout(user, id);
  }

  // CheckoutControl
  @Get('/checkout-control')
  getCheckoutControl() {
    return this.checkoutService.findAllCheckoutControl();
  }

  @Post('/checkout-control')
  createCheckoutControl(
    @ReqUser() user: User,
    @Body() createCheckoutControlDto: CreateCheckoutControlDto,
  ) {
    return this.checkoutService.createCheckoutControl(
      user,
      createCheckoutControlDto,
    );
  }

  @Patch('/checkout-control/:id')
  updateCheckoutControl(
    @ReqUser() user: User,
    @Param('id') id: string,
    @Body() updates: UpdateQuery<CheckoutControl>,
  ) {
    return this.checkoutService.updateCheckoutControl(user, id, updates);
  }

  @Delete('/checkout-control/:id')
  deleteCheckoutControl(@ReqUser() user: User, @Param('id') id: string) {
    return this.checkoutService.removeCheckoutControl(user, id);
  }
}
