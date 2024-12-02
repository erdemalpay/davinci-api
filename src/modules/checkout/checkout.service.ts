import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { User } from '../user/user.schema';
import { Cashout } from './cashout.schema';
import {
  CreateCashoutDto,
  CreateCheckoutControlDto,
  CreateIncomeDto,
} from './checkout.dto';
import { CheckoutGateway } from './checkout.gateway';
import { CheckoutControl } from './checkoutControl.schema';
import { Income } from './income.schema';

@Injectable()
export class CheckoutService {
  constructor(
    @InjectModel(Income.name) private incomeModel: Model<Income>,
    @InjectModel(Cashout.name) private cashoutModel: Model<Cashout>,
    @InjectModel(CheckoutControl.name)
    private checkoutControlModel: Model<CheckoutControl>,
    private readonly checkoutGateway: CheckoutGateway,
  ) {}
  // income
  findAllIncome() {
    return this.incomeModel.find().sort({ date: 1 });
  }
  async createIncome(user: User, createIncomeDto: CreateIncomeDto) {
    const income = await this.incomeModel.create({
      ...createIncomeDto,
      user: user._id,
    });
    this.checkoutGateway.emitIncomeChanged(user, income);
    return income;
  }
  async updateIncome(user: User, id: string, updates: UpdateQuery<Income>) {
    const income = await this.incomeModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.checkoutGateway.emitIncomeChanged(user, income);
    return income;
  }
  async removeIncome(user: User, id: string) {
    const income = await this.incomeModel.findByIdAndRemove(id);
    this.checkoutGateway.emitIncomeChanged(user, income);
    return income;
  }

  // Cashout
  findAllCashout() {
    return this.cashoutModel.find();
  }
  async createCashout(user: User, createCashoutDto: CreateCashoutDto) {
    const cashout = await this.cashoutModel.create({
      ...createCashoutDto,
      user: user._id,
    });
    this.checkoutGateway.emitCashoutChanged(user, cashout);
    return cashout;
  }
  async updateCashout(user: User, id: string, updates: UpdateQuery<Cashout>) {
    const cashout = await this.cashoutModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.checkoutGateway.emitCashoutChanged(user, cashout);
    return cashout;
  }
  async removeCashout(usre: User, id: string) {
    const cashout = await this.cashoutModel.findByIdAndRemove(id);
    this.checkoutGateway.emitCashoutChanged(usre, cashout);
    return cashout;
  }

  // CheckoutControl
  findAllCheckoutControl() {
    return this.checkoutControlModel.find().sort({ date: 1 });
  }
  async createCheckoutControl(
    user: User,
    createCheckoutControlDto: CreateCheckoutControlDto,
  ) {
    const CheckoutControl = await this.checkoutControlModel.create({
      ...createCheckoutControlDto,
      user: user._id,
    });
    this.checkoutGateway.emitCheckoutControlChanged(user, CheckoutControl);
    return CheckoutControl;
  }
  async updateCheckoutControl(
    user: User,
    id: string,
    updates: UpdateQuery<CheckoutControl>,
  ) {
    const checkoutControl = await this.checkoutControlModel.findByIdAndUpdate(
      id,
      updates,
      {
        new: true,
      },
    );
    this.checkoutGateway.emitCheckoutControlChanged(user, checkoutControl);
    return checkoutControl;
  }
  async removeCheckoutControl(user: User, id: string) {
    const checkoutControl = await this.checkoutControlModel.findByIdAndRemove(
      id,
    );
    this.checkoutGateway.emitCheckoutControlChanged(user, checkoutControl);
    return checkoutControl;
  }
}
