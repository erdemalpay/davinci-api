import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { Cashout, CashoutSchema } from './cashout.schema';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { Expense, ExpenseSchema } from './expense.schema';
import { Income, IncomeSchema } from './income.schema';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Income.name, IncomeSchema),
  createAutoIncrementConfig(Expense.name, ExpenseSchema),
  createAutoIncrementConfig(Cashout.name, CashoutSchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [CheckoutService],
  controllers: [CheckoutController],
  exports: [mongooseModule, CheckoutService, CheckoutModule],
})
export class CheckoutModule {}
