import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { Cashout, CashoutSchema } from './cashout.schema';
import { CheckoutController } from './checkout.controller';
import { CheckoutGateway } from './checkout.gateway';
import { CheckoutService } from './checkout.service';
import {
  CheckoutControl,
  CheckoutControlSchema,
} from './checkoutControl.schema';
import { Income, IncomeSchema } from './income.schema';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Income.name, IncomeSchema),
  createAutoIncrementConfig(Cashout.name, CashoutSchema),
  createAutoIncrementConfig(CheckoutControl.name, CheckoutControlSchema),
]);

@Module({
  imports: [mongooseModule],
  providers: [CheckoutService, CheckoutGateway],
  controllers: [CheckoutController],
  exports: [CheckoutService, CheckoutGateway],
})
export class CheckoutModule {}
