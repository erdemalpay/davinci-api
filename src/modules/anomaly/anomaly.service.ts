import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as moment from 'moment-timezone';
import { Model } from 'mongoose';
import { CAFE_TIME_ZONE } from 'src/utils/cafeTime';
import { ActivityType } from '../activity/activity.dto';
import { Activity } from '../activity/activity.schema';
import { Product } from '../accounting/product.schema';
import { ProductStockHistory } from '../accounting/productStockHistory.schema';
import { Break } from '../break/break.schema';
import { MiddlemanRecord } from '../buttonCall/buttonCall.assignment';
import { ButtonCall } from '../buttonCall/schemas/buttonCall.schema';
import { Gameplay } from '../gameplay/gameplay.schema';
import { Location } from '../location/location.schema';
import { Middleman } from '../middleman/middleman.schema';
import { Collection } from '../order/collection.schema';
import { Order } from '../order/order.schema';
import { Shift } from '../shift/shift.schema';
import { Table } from '../table/table.schema';
import { User } from '../user/user.schema';
import { Visit } from '../visit/visit.schema';
import {
  DayActivity,
  DayData,
  DayOrder,
  findAnomalies,
  NegativeStock,
  orderDiscount,
} from './anomaly.checks';
import { AnomalyQueryDto, UpdateAnomalyDto } from './anomaly.dto';
import { Anomaly } from './anomaly.schema';

// The activities the checks look at.
const CHECKED_ACTIVITIES = [
  ActivityType.CANCEL_ORDER,
  ActivityType.ORDER_DISCOUNT,
  ActivityType.CANCEL_PAYMENT,
  ActivityType.REOPENED_TABLE,
  ActivityType.DELETE_TABLE,
  ActivityType.DELETE_VISIT,
];
// A person's or place's usual day is taken from this many days before.
const HISTORY_DAYS = 30;
// A cafe day runs until 06:00 the next morning (see cafeDaySeconds).
const CAFE_DAY_ENDS_AT_HOUR = 6;

// The span of a cafe day, or of several, as timestamps.
function cafeDayWindow(firstDay: string, lastDay = firstDay) {
  return {
    $gte: moment
      .tz(firstDay, CAFE_TIME_ZONE)
      .hour(CAFE_DAY_ENDS_AT_HOUR)
      .toDate(),
    $lt: moment
      .tz(lastDay, CAFE_TIME_ZONE)
      .add(1, 'day')
      .hour(CAFE_DAY_ENDS_AT_HOUR)
      .toDate(),
  };
}

// The cafe day and hour of a timestamp.
function toCafeDay(at: Date) {
  const time = moment(at).tz(CAFE_TIME_ZONE);
  const day =
    time.hour() < CAFE_DAY_ENDS_AT_HOUR
      ? time.clone().subtract(1, 'day')
      : time;
  return { date: day.format('YYYY-MM-DD'), hour: time.format('HH:mm') };
}

const shiftDay = (date: string, days: number) =>
  moment.tz(date, CAFE_TIME_ZONE).add(days, 'day').format('YYYY-MM-DD');

// Values per key, one per day that had any.
function perDay<K>(rows: { key: K; date: string; value: number }[]) {
  const byKey = new Map<K, Map<string, number>>();
  for (const { key, date, value } of rows) {
    const days = byKey.get(key) ?? new Map<string, number>();
    days.set(date, (days.get(date) ?? 0) + value);
    byKey.set(key, days);
  }
  return new Map([...byKey].map(([key, days]) => [key, [...days.values()]]));
}

@Injectable()
export class AnomalyService {
  private readonly logger = new Logger(AnomalyService.name);

  constructor(
    @InjectModel(Anomaly.name) private anomalyModel: Model<Anomaly>,
    @InjectModel(Table.name) private tableModel: Model<Table>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Collection.name) private collectionModel: Model<Collection>,
    @InjectModel(Activity.name)
    private activityModel: Model<Activity<ActivityType>>,
    @InjectModel(Visit.name) private visitModel: Model<Visit>,
    @InjectModel(Shift.name) private shiftModel: Model<Shift>,
    @InjectModel(Location.name) private locationModel: Model<Location>,
    @InjectModel(Break.name) private breakModel: Model<Break>,
    @InjectModel(ButtonCall.name) private buttonCallModel: Model<ButtonCall>,
    @InjectModel(Gameplay.name) private gameplayModel: Model<Gameplay>,
    @InjectModel(Middleman.name) private middlemanModel: Model<Middleman>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Product.name) private productModel: Model<Product>,
    @InjectModel(ProductStockHistory.name)
    private stockHistoryModel: Model<ProductStockHistory>,
  ) {}

  async find(query: AnomalyQueryDto) {
    const filter: Record<string, unknown> = {};
    if (query.after || query.before) {
      filter.date = {
        ...(query.after && { $gte: query.after }),
        ...(query.before && { $lte: query.before }),
      };
    }
    if (query.location) filter.location = query.location;
    return this.anomalyModel.find(filter).sort({ date: -1, _id: 1 }).lean();
  }

  async update(id: number, dto: UpdateAnomalyDto, user: User) {
    const updated = await this.anomalyModel.findByIdAndUpdate(
      id,
      {
        ...dto,
        ...(dto.reviewed !== undefined && {
          reviewedBy: dto.reviewed ? user._id : null,
          reviewedAt: dto.reviewed ? new Date() : null,
        }),
      },
      { new: true },
    );
    if (!updated) throw new NotFoundException('Anomaly not found');
    return updated;
  }

  // Checks a cafe day: new findings are added, findings that are gone are
  // removed unless someone reviewed them.
  async run(date: string) {
    // A day is checked once it's over.
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date >= toCafeDay(new Date()).date
    ) {
      throw new BadRequestException('Only a past day can be checked');
    }
    const drafts = findAnomalies(await this.loadDay(date));
    const existing = await this.anomalyModel
      .find({ date })
      .select('type key reviewed')
      .lean();
    const keyOf = (a: { type: string; key: string }) => `${a.type}|${a.key}`;
    const found = new Set(drafts.map(keyOf));
    const known = new Set(existing.map(keyOf));
    const gone = existing.filter((a) => !a.reviewed && !found.has(keyOf(a)));
    if (gone.length) {
      await this.anomalyModel.deleteMany({
        _id: { $in: gone.map((a) => a._id) },
      });
    }
    for (const draft of drafts) {
      if (known.has(keyOf(draft))) continue;
      known.add(keyOf(draft));
      await this.anomalyModel.create({ ...draft, date });
    }
    this.logger.log(
      `Anomalies of ${date}: ${drafts.length} found, ${gone.length} gone`,
    );
    return this.find({ after: date, before: date });
  }

  private async loadDay(date: string): Promise<DayData> {
    const window = cafeDayWindow(date);
    const tables = await this.tableModel
      .find({ date })
      .select('location name type startHour finishHour status isOnlineSale')
      .lean();
    const tableIds = tables.map((t) => t._id);
    const [
      orders,
      collections,
      activities,
      visits,
      shifts,
      locations,
      breaks,
      calls,
      gameplays,
      middlemen,
      users,
      stockChanges,
    ] = await Promise.all([
      this.orderModel
        .find({ table: { $in: tableIds } })
        .select(
          'table location status quantity paidQuantity unitPrice discountAmount discountPercentage isOnlineSale',
        )
        .lean(),
      this.collectionModel
        .find({ table: { $in: tableIds } })
        .select(
          'table location amount status createdBy cancelledBy cancelledAt',
        )
        .lean(),
      this.activityModel
        .find({ type: { $in: CHECKED_ACTIVITIES }, createdAt: window })
        .select('user type payload createdAt')
        .lean(),
      this.visitModel
        .find({ date })
        .select('user location startHour finishHour')
        .lean(),
      this.shiftModel.find({ day: date }).select('location shifts').lean(),
      this.locationModel.find().select('shifts').lean(),
      this.breakModel
        .find({ date })
        .select('user location type startHour finishHour')
        .lean(),
      this.buttonCallModel
        .find({ date })
        .select(
          'location tableName type startHour finishHour assignmentHistory',
        )
        .lean(),
      this.gameplayModel
        .find({ date })
        .select('location mentor game startHour')
        .lean(),
      this.middlemanModel
        .find({ date })
        .select(
          'user location date startHour finishHour coveringFor awayOnCall',
        )
        .lean(),
      this.userModel.find().select('role userGames').lean(),
      this.stockHistoryModel
        .find({ createdAt: window })
        .select('product location change currentAmount status user')
        .lean(),
    ]);
    const prices = await this.findUnitPrices(
      stockChanges.map((c) => String(c.product)),
    );
    const shiftsByLocation = new Map(
      locations.map((l) => [Number(l._id), l.shifts ?? []]),
    );

    // Stock that went below zero that day, once per product and location.
    const negativeStocks = new Map<string, NegativeStock>();
    for (const c of stockChanges) {
      const before = c.currentAmount - c.change;
      if (c.currentAmount >= 0 || before < 0) continue;
      const key = `${c.product}-${c.location}`;
      if (!negativeStocks.has(key)) {
        negativeStocks.set(key, {
          product: String(c.product),
          productName: prices.get(String(c.product))?.name,
          location: Number(c.location),
          quantity: c.currentAmount,
        });
      }
    }

    const history = await this.loadHistory(date);
    return {
      date,
      tables: tables.map((t) => ({ ...t, location: Number(t.location) })),
      orders: orders as unknown as DayOrder[],
      collections: collections.map((c) => ({
        ...c,
        location: Number(c.location),
      })),
      activities: activities
        .filter((a) => !(a.payload as { isOnlineSale?: boolean })?.isOnlineSale)
        .map((a) => ({
          user: String(a.user),
          type: a.type,
          payload: a.payload as DayActivity['payload'],
          hour: toCafeDay((a as unknown as { createdAt: Date }).createdAt).hour,
        })),
      visits: visits.map((v) => ({
        user: String(v.user),
        location: Number(v.location),
        startHour: v.startHour,
        finishHour: v.finishHour,
      })),
      shifts: shifts.map((s) => ({
        location: Number(s.location),
        slots: s.shifts ?? [],
        locationShifts: shiftsByLocation.get(Number(s.location)) ?? [],
      })),
      breaks: breaks.map((b) => ({
        user: String(b.user),
        location: Number(b.location),
        type: b.type,
        startHour: b.startHour,
        finishHour: b.finishHour,
      })),
      calls: calls.map((c) => ({ ...c, location: Number(c.location) })),
      gameplays: gameplays.map((g) => ({
        _id: g._id,
        location: Number(g.location),
        mentor: g.mentor ? String(g.mentor) : undefined,
        game: g.game ? Number(g.game) : undefined,
        startHour: g.startHour,
      })),
      middlemen: middlemen as unknown as MiddlemanRecord[],
      users: users.map((u) => ({
        _id: String(u._id),
        role: Number(u.role),
        games: new Map(
          (u.userGames ?? []).map((g) => [Number(g.game), g.learnDate]),
        ),
      })),
      stockChanges: stockChanges.map((c) => ({
        product: String(c.product),
        location: Number(c.location),
        status: c.status,
        change: c.change,
        unitPrice: prices.get(String(c.product))?.unitPrice ?? 0,
        productName: prices.get(String(c.product))?.name,
        user: c.user ? String(c.user) : undefined,
      })),
      negativeStocks: [...negativeStocks.values()],
      ...history,
    };
  }

  // Everyone's discounts and cancelled orders, and the waste of each
  // location, on the days before.
  private async loadHistory(date: string) {
    const window = cafeDayWindow(
      shiftDay(date, -HISTORY_DAYS),
      shiftDay(date, -1),
    );
    const [activities, losses] = await Promise.all([
      this.activityModel
        .find({
          type: {
            $in: [ActivityType.ORDER_DISCOUNT, ActivityType.CANCEL_ORDER],
          },
          createdAt: window,
        })
        .select('user type payload._id payload.isOnlineSale createdAt')
        .lean(),
      this.stockHistoryModel
        .find({ status: 'LOSSPRODUCT', createdAt: window })
        .select('product location change createdAt')
        .lean(),
    ]);
    const inCafe = activities.filter(
      (a) => !(a.payload as { isOnlineSale?: boolean })?.isOnlineSale,
    );
    const discountedIds = [
      ...new Set(
        inCafe
          .filter((a) => a.type === ActivityType.ORDER_DISCOUNT)
          .map((a) => (a.payload as { _id: number })?._id),
      ),
    ];
    const [discountedOrders, prices] = await Promise.all([
      this.orderModel
        .find({ _id: { $in: discountedIds } })
        .select('quantity unitPrice discountAmount discountPercentage')
        .lean(),
      this.findUnitPrices(losses.map((l) => String(l.product))),
    ]);
    const discountOf = new Map(
      discountedOrders.map((o) => [
        o._id as number,
        orderDiscount(o as unknown as DayOrder),
      ]),
    );
    const createdAt = (a: unknown) => (a as { createdAt: Date }).createdAt;
    const counted = new Set<number>();
    const discountRows: { key: string; date: string; value: number }[] = [];
    for (const a of inCafe) {
      if (a.type !== ActivityType.ORDER_DISCOUNT) continue;
      const id = (a.payload as { _id: number })?._id;
      if (counted.has(id) || !discountOf.has(id)) continue;
      counted.add(id);
      discountRows.push({
        key: String(a.user),
        date: toCafeDay(createdAt(a)).date,
        value: discountOf.get(id),
      });
    }
    return {
      discountHistory: perDay(discountRows),
      cancelHistory: perDay(
        inCafe
          .filter((a) => a.type === ActivityType.CANCEL_ORDER)
          .map((a) => ({
            key: String(a.user),
            date: toCafeDay(createdAt(a)).date,
            value: 1,
          })),
      ),
      wasteHistory: perDay(
        losses.map((l) => ({
          key: Number(l.location),
          date: toCafeDay(l.createdAt).date,
          value:
            Math.abs(l.change) *
            (prices.get(String(l.product))?.unitPrice ?? 0),
        })),
      ),
    };
  }

  private async findUnitPrices(productIds: string[]) {
    const products = await this.productModel
      .find({ _id: { $in: [...new Set(productIds)] } })
      .select('unitPrice name')
      .lean();
    return new Map(
      products.map((p) => [
        String(p._id),
        { unitPrice: p.unitPrice ?? 0, name: p.name },
      ]),
    );
  }
}
