import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { format } from 'date-fns';
import { Model, PipelineStage, UpdateQuery } from 'mongoose';
import { User } from '../user/user.schema';
import { dateRanges } from './../../utils/dateRanges';
import { Cashout } from './cashout.schema';
import {
  CashoutDateFilter,
  CheckoutFilterType,
  CreateCashoutDto,
  CreateCheckoutControlDto,
  CreateIncomeDto,
  IncomeQueryDto,
} from './checkout.dto';
import { CheckoutControl } from './checkoutControl.schema';
import { Income } from './income.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';

@Injectable()
export class CheckoutService {
  constructor(
    @InjectModel(Income.name) private incomeModel: Model<Income>,
    @InjectModel(Cashout.name) private cashoutModel: Model<Cashout>,
    @InjectModel(CheckoutControl.name)
    private checkoutControlModel: Model<CheckoutControl>,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}
  // income
  findAllIncome() {
    return this.incomeModel.find().sort({ date: 1 });
  }
  async findQueryIncome(filter: CashoutDateFilter) {
    let { after, before, date } = filter;
    let startDate: string | null = null;
    if (after) {
      startDate = format(
        new Date(new Date(after).getTime() - 30 * 24 * 60 * 60 * 1000),
        'yyyy-MM-dd',
      );
    }
    if (date && dateRanges[date]) {
      const dr = dateRanges[date]();
      after = dr.after;
      before = dr.before;
      if (after) {
        startDate = format(
          new Date(new Date(after).getTime() - 30 * 24 * 60 * 60 * 1000),
          'yyyy-MM-dd',
        );
      }
    }
    const match: Record<string, any> = {};
    if (startDate && before) {
      match.date = { $gte: startDate, $lte: before };
    } else if (startDate) {
      match.date = { $gte: startDate };
    } else if (before) {
      match.date = { $lte: before };
    }
    return this.incomeModel.find(match).sort({ date: -1 }).exec();
  }
  parseLocalDate(dateString: string): Date {
    const [y, m, d] = dateString.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  async findPaginatedQueryIncomes(query: IncomeQueryDto) {
    const {
      page = 1,
      limit = 10,
      user,
      date,
      after,
      before,
      sort,
      asc,
    } = query;

    const filter: Record<string, any> = {};

    if (user && `${user}`.trim() !== '') {
      filter.user = user;
    }

    if (date && dateRanges[date]) {
      const { after: dAfter, before: dBefore } = dateRanges[date]();
      const start = this.parseLocalDate(dAfter);
      const end = this.parseLocalDate(dBefore);
      end.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: start, $lte: end };
    } else {
      const rangeFilter: Record<string, any> = {};
      if (after) {
        const start = this.parseLocalDate(after);
        rangeFilter.$gte = start;
      }
      if (before) {
        const endD = this.parseLocalDate(before);
        endD.setHours(23, 59, 59, 999);
        rangeFilter.$lte = endD;
      }
      if (Object.keys(rangeFilter).length) filter.createdAt = rangeFilter;
    }

    const sortObject: Record<string, 1 | -1> = {};
    if (sort) {
      const dirRaw =
        typeof asc === 'string' ? Number(asc) : (asc as number | undefined);
      const dir: 1 | -1 = dirRaw === 1 ? 1 : -1;
      sortObject[sort] = dir;
    } else {
      sortObject.createdAt = -1;
    }

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    const [data, totalNumber, totalAgg] = await Promise.all([
      this.incomeModel
        .find(filter)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .lean()
        .exec(),
      this.incomeModel.countDocuments(filter),
      this.incomeModel
        .aggregate([
          { $match: filter },
          { $group: { _id: null, sum: { $sum: '$amount' } } },
        ])
        .exec(),
    ]);

    const totalPages = Math.ceil(totalNumber / limitNum);
    const generalTotal = totalAgg?.[0]?.sum ?? 0;

    return {
      data,
      totalNumber,
      totalPages,
      generalTotal,
      page: pageNum,
      limit: limitNum,
    };
  }
  async createIncome(user: User, createIncomeDto: CreateIncomeDto) {
    const income = await this.incomeModel.create({
      ...createIncomeDto,
      user: user._id,
    });
    this.websocketGateway.emitIncomeChanged(user, income);
    return income;
  }
  async updateIncome(user: User, id: string, updates: UpdateQuery<Income>) {
    const income = await this.incomeModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.websocketGateway.emitIncomeChanged(user, income);
    return income;
  }
  async removeIncome(user: User, id: string) {
    const income = await this.incomeModel.findByIdAndRemove(id);
    this.websocketGateway.emitIncomeChanged(user, income);
    return income;
  }

  // Cashout
  findAllCashout() {
    return this.cashoutModel.find();
  }
  async findQueryCashouts(filter: CashoutDateFilter) {
    let { after, before, date } = filter;
    let startDate: string | null = null;
    if (after) {
      startDate = format(
        new Date(new Date(after).getTime() - 30 * 24 * 60 * 60 * 1000),
        'yyyy-MM-dd',
      );
    }
    if (date && dateRanges[date]) {
      const dr = dateRanges[date]();
      after = dr.after;
      before = dr.before;
      if (after) {
        startDate = format(
          new Date(new Date(after).getTime() - 30 * 24 * 60 * 60 * 1000),
          'yyyy-MM-dd',
        );
      }
    }
    const match: Record<string, any> = {};
    if (startDate && before) {
      match.date = { $gte: startDate, $lte: before };
    } else if (startDate) {
      match.date = { $gte: startDate };
    } else if (before) {
      match.date = { $lte: before };
    }
    return this.cashoutModel.find(match).sort({ date: -1 }).exec();
  }

  async createCashout(user: User, createCashoutDto: CreateCashoutDto) {
    const cashout = await this.cashoutModel.create({
      ...createCashoutDto,
      user: user._id,
    });
    this.websocketGateway.emitCashoutChanged(user, cashout);
    return cashout;
  }
  async updateCashout(user: User, id: string, updates: UpdateQuery<Cashout>) {
    const cashout = await this.cashoutModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    this.websocketGateway.emitCashoutChanged(user, cashout);
    return cashout;
  }
  async removeCashout(usre: User, id: string) {
    const cashout = await this.cashoutModel.findByIdAndRemove(id);
    this.websocketGateway.emitCashoutChanged(usre, cashout);
    return cashout;
  }

  // CheckoutControl
  async findQueryCheckoutControl(filter: CheckoutFilterType) {
    const { user, location, date, after: rawAfter, before: rawBefore } = filter;
    let after = rawAfter,
      before = rawBefore;
    let startDate: string | undefined;

    if (after) {
      startDate = format(
        new Date(new Date(after).getTime() - 30 * 24 * 60 * 60 * 1000),
        'yyyy-MM-dd',
      );
    }
    if (date && dateRanges[date]) {
      const dr = dateRanges[date]();
      after = dr.after;
      before = dr.before;
      if (after) {
        startDate = format(
          new Date(new Date(after).getTime() - 30 * 24 * 60 * 60 * 1000),
          'yyyy-MM-dd',
        );
      }
    }
    const match: Record<string, any> = {};
    if (startDate && before) {
      match.date = { $gte: startDate, $lte: before };
    } else if (startDate) {
      match.date = { $gte: startDate };
    } else if (before) {
      match.date = { $lte: before };
    }
    const matchCondition: Record<string, any> = {
      ...(location && { location: Number(location) }),
      ...(user && { user }),
      ...match,
    };

    const pipeline: PipelineStage[] = [
      { $match: matchCondition },
      { $sort: { date: 1 } },
    ];

    return this.checkoutControlModel.aggregate(pipeline);
  }

  async createCheckoutControl(
    user: User,
    createCheckoutControlDto: CreateCheckoutControlDto,
  ) {
    const CheckoutControl = await this.checkoutControlModel.create({
      ...createCheckoutControlDto,
      user: user._id,
    });
    this.websocketGateway.emitCheckoutControlChanged(user, CheckoutControl);
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
    this.websocketGateway.emitCheckoutControlChanged(user, checkoutControl);
    return checkoutControl;
  }
  async removeCheckoutControl(user: User, id: string) {
    const checkoutControl = await this.checkoutControlModel.findByIdAndRemove(
      id,
    );
    this.websocketGateway.emitCheckoutControlChanged(user, checkoutControl);
    return checkoutControl;
  }
}
