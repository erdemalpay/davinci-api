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
  @Get('/income/paginated/query')
  findPaginatedQueryIncomes(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('user') user?: string,
    @Query('date') date?: string,
    @Query('after') after?: string,
    @Query('before') before?: string,
    @Query('sort') sort?: string,
    @Query('asc') asc?: number | '1' | '0' | '-1',
    @Query('search') search?: string,
  ) {
    return this.checkoutService.findPaginatedQueryIncomes({
      page,
      limit,
      user,
      date,
      after,
      before,
      sort,
      asc,
      search,
    });
  }

  @Get('/income/query')
  findQueryIncome(
    @Query('after') after?: string,
    @Query('before') before?: string,
    @Query('date') date?: string,
  ) {
    return this.checkoutService.findQueryIncome({
      after,
      before,
      date,
    });
  }

  @Post('/income')
  createIncome(
    @ReqUser() user: User,
    @Body() createIncomeDto: CreateIncomeDto,
  ) {
    return this.checkoutService.createIncome(user, createIncomeDto);
  }

  @Patch('/income/:id')
  updateIncome(@Param('id') id: string, @Body() updates: UpdateQuery<Income>) {
    return this.checkoutService.updateIncome(id, updates);
  }

  @Delete('/income/:id')
  deleteIncome(@Param('id') id: string) {
    return this.checkoutService.removeIncome(id);
  }
  // Cashout
  @Get('/cashout')
  getCashout() {
    return this.checkoutService.findAllCashout();
  }
  @Get('/cashout/query')
  findQueryPayments(
    @Query('after') after?: string,
    @Query('before') before?: string,
    @Query('date') date?: string,
  ) {
    return this.checkoutService.findQueryCashouts({
      after,
      before,
      date,
    });
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
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Cashout>,
  ) {
    return this.checkoutService.updateCashout(id, updates);
  }

  @Delete('/cashout/:id')
  deleteCashout(@Param('id') id: string) {
    return this.checkoutService.removeCashout(id);
  }

  // CheckoutControl
  @Get('/checkout-control')
  getCheckoutControl(
    @Query('user') user?: string,
    @Query('location') location?: string,
    @Query('date') date?: string,
    @Query('after') after?: string,
    @Query('before') before?: string,
  ) {
    return this.checkoutService.findQueryCheckoutControl({
      user,
      location,
      date,
      after,
      before,
    });
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
    @Param('id') id: string,
    @Body() updates: UpdateQuery<CheckoutControl>,
  ) {
    return this.checkoutService.updateCheckoutControl(id, updates);
  }

  @Delete('/checkout-control/:id')
  deleteCheckoutControl(@Param('id') id: string) {
    return this.checkoutService.removeCheckoutControl(id);
  }
}
