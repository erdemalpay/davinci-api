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
  CreateExpenseDto,
  CreateIncomeDto,
} from './checkout.dto';
import { CheckoutService } from './checkout.service';
import { Expense } from './expense.schema';
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
  updateIncome(@Param('id') id: string, @Body() updates: UpdateQuery<Income>) {
    return this.checkoutService.updateIncome(id, updates);
  }

  @Delete('/income/:id')
  deleteIncome(@Param('id') id: string) {
    return this.checkoutService.removeIncome(id);
  }
  // Expense
  @Get('/expense')
  getExpense() {
    return this.checkoutService.findAllExpense();
  }

  @Post('/expense')
  createExpense(
    @ReqUser() user: User,
    @Body() createExpenseDto: CreateExpenseDto,
  ) {
    return this.checkoutService.createExpense(user, createExpenseDto);
  }

  @Patch('/expense/:id')
  updateExpense(
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Expense>,
  ) {
    return this.checkoutService.updateExpense(id, updates);
  }

  @Delete('/expense/:id')
  deleteExpense(@Param('id') id: string) {
    return this.checkoutService.removeExpense(id);
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
    @Param('id') id: string,
    @Body() updates: UpdateQuery<Cashout>,
  ) {
    return this.checkoutService.updateCashout(id, updates);
  }

  @Delete('/cashout/:id')
  deleteCashout(@Param('id') id: string) {
    return this.checkoutService.removeCashout(id);
  }
}
