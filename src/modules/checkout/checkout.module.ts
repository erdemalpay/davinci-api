import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { Cashout, CashoutSchema } from './cashout.schema';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import {
  CheckoutControl,
  CheckoutControlSchema,
} from './checkoutControl.schema';
import { Income, IncomeSchema } from './income.schema';
import { WebSocketModule } from '../websocket/websocket.module';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Income.name, IncomeSchema),
  createAutoIncrementConfig(Cashout.name, CashoutSchema),
  createAutoIncrementConfig(CheckoutControl.name, CheckoutControlSchema),
]);

@Module({
  imports: [
    WebSocketModule,mongooseModule],
  providers: [CheckoutService],
  controllers: [CheckoutController],
  exports: [CheckoutService],
})
export class CheckoutModule {}
