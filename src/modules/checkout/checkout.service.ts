import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { User } from '../user/user.schema';
import { Cashout } from './cashout.schema';
import { CreateCashoutDto, CreateIncomeDto } from './checkout.dto';
import { Income } from './income.schema';

@Injectable()
export class CheckoutService {
  constructor(
    @InjectModel(Income.name) private incomeModel: Model<Income>,
    @InjectModel(Cashout.name) private cashoutModel: Model<Cashout>,
  ) {}
  // income
  findAllIncome() {
    return this.incomeModel
      .find()
      .populate({
        path: 'user',
        select: '-password',
      })
      .populate('location');
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
}
