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
import { CheckoutControl } from './checkoutControl.schema';
import { Income } from './income.schema';

@Injectable()
export class CheckoutService {
  constructor(
    @InjectModel(Income.name) private incomeModel: Model<Income>,
    @InjectModel(Cashout.name) private cashoutModel: Model<Cashout>,
    @InjectModel(CheckoutControl.name)
    private checkoutControlModel: Model<CheckoutControl>,
  ) {}
  // income
  findAllIncome() {
    return this.incomeModel
      .find()
      .populate({
        path: 'user',
        select: '-password',
      })
      .populate('location')
      .sort({ date: 1 });
  }
  createIncome(user: User, createIncomeDto: CreateIncomeDto) {
    return this.incomeModel.create({ ...createIncomeDto, user: user._id });
  }
  updateIncome(id: string, updates: UpdateQuery<Income>) {
    return this.incomeModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeIncome(id: string) {
    return this.incomeModel.findByIdAndRemove(id);
  }

  // Cashout
  findAllCashout() {
    return this.cashoutModel
      .find()
      .populate({
        path: 'user',
        select: '-password',
      })
      .populate('location');
  }
  createCashout(user: User, createCashoutDto: CreateCashoutDto) {
    return this.cashoutModel.create({ ...createCashoutDto, user: user._id });
  }
  updateCashout(id: string, updates: UpdateQuery<Cashout>) {
    return this.cashoutModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeCashout(id: string) {
    return this.cashoutModel.findByIdAndRemove(id);
  }

  // CheckoutControl
  findAllCheckoutControl() {
    return this.checkoutControlModel
      .find()
      .populate({
        path: 'user',
        select: '-password',
      })
      .populate('location')
      .sort({ date: 1 });
  }
  createCheckoutControl(
    user: User,
    createCheckoutControlDto: CreateCheckoutControlDto,
  ) {
    return this.checkoutControlModel.create({
      ...createCheckoutControlDto,
      user: user._id,
    });
  }
  updateCheckoutControl(id: string, updates: UpdateQuery<CheckoutControl>) {
    return this.checkoutControlModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
  }
  removeCheckoutControl(id: string) {
    return this.checkoutControlModel.findByIdAndRemove(id);
  }
}
