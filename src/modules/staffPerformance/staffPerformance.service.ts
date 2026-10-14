import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { CAFE_TIME_ZONE, cafeDaysSpan } from 'src/utils/cafeTime';
import { Gameplay } from '../gameplay/gameplay.schema';
import { Collection } from '../order/collection.schema';
import { OrderCollectionStatus, OrderStatus } from '../order/order.dto';
import { Order } from '../order/order.schema';
import {
  StaffDailyCountField,
  StaffDailyCounts,
  StaffPerformanceQueryDto,
} from './staffPerformance.dto';

type CountRow = {
  _id: { user: string; date: string; field: StaffDailyCountField };
  count: number;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const cafeDate = (date: string) => ({
  $dateToString: { format: '%Y-%m-%d', date, timezone: CAFE_TIME_ZONE },
});

// Per person and cafe day, what each one did: orders taken, prepared and
// delivered, collections, games set up and explained (and their narration
// points). The panel decides which days count (shift plan, middleman and
// service staff days).
@Injectable()
export class StaffPerformanceService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Collection.name) private collectionModel: Model<Collection>,
    @InjectModel(Gameplay.name) private gameplayModel: Model<Gameplay>,
  ) {}

  async findDailyCounts(
    query: StaffPerformanceQueryDto,
  ): Promise<StaffDailyCounts[]> {
    const rows = (
      await Promise.all([
        this.countOrders(query),
        this.countCollections(query),
        this.countGameplays(query),
      ])
    ).flat();

    const byUserDay = new Map<string, StaffDailyCounts>();
    for (const { _id, count } of rows) {
      const key = `${_id.user}|${_id.date}`;
      const counts = byUserDay.get(key) ?? {
        user: _id.user,
        date: _id.date,
        ordersCreated: 0,
        ordersPrepared: 0,
        ordersDelivered: 0,
        collections: 0,
        gameplaysCreated: 0,
        gameplaysMentored: 0,
        gameplaysMentoredPoints: 0,
      };
      counts[_id.field] += count;
      byUserDay.set(key, counts);
    }
    return [...byUserDay.values()];
  }

  // Each action counts on the day it was done; an order is prepared and
  // delivered after it is taken, so orders taken the day before are looked
  // at too.
  private countOrders({ after, before, location }: StaffPerformanceQueryDto) {
    const { start, end } = cafeDaysSpan(after, before);
    const pipeline: PipelineStage[] = [
      {
        $match: {
          createdAt: {
            $gte: new Date(start.getTime() - ONE_DAY_MS),
            $lte: end,
          },
          status: { $ne: OrderStatus.CANCELLED },
          ...(location && { location: Number(location) }),
        },
      },
      {
        $project: {
          actions: [
            { field: 'ordersCreated', user: '$createdBy', at: '$createdAt' },
            { field: 'ordersPrepared', user: '$preparedBy', at: '$preparedAt' },
            {
              field: 'ordersDelivered',
              user: '$deliveredBy',
              at: '$deliveredAt',
            },
          ],
        },
      },
      { $unwind: '$actions' },
      {
        $match: {
          'actions.user': { $ne: null },
          'actions.at': { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            user: '$actions.user',
            date: cafeDate('$actions.at'),
            field: '$actions.field',
          },
          count: { $sum: 1 },
        },
      },
    ];
    return this.orderModel.aggregate<CountRow>(pipeline).exec();
  }

  private countCollections({
    after,
    before,
    location,
  }: StaffPerformanceQueryDto) {
    const { start, end } = cafeDaysSpan(after, before);
    const pipeline: PipelineStage[] = [
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          createdBy: { $ne: null },
          status: { $ne: OrderCollectionStatus.CANCELLED },
          ...(location && { location: Number(location) }),
        },
      },
      {
        $group: {
          _id: {
            user: '$createdBy',
            date: cafeDate('$createdAt'),
            field: 'collections',
          },
          count: { $sum: 1 },
        },
      },
    ];
    return this.collectionModel.aggregate<CountRow>(pipeline).exec();
  }

  private countGameplays({
    after,
    before,
    location,
  }: StaffPerformanceQueryDto) {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          date: { $gte: after, $lte: before },
          ...(location && { location: Number(location) }),
        },
      },
      {
        $lookup: {
          from: 'games',
          localField: 'game',
          foreignField: '_id',
          as: 'game',
          pipeline: [{ $project: { narrationDurationPoint: 1 } }],
        },
      },
      {
        $project: {
          actions: [
            {
              field: 'gameplaysCreated',
              user: '$createdBy',
              date: '$date',
              value: 1,
            },
            {
              field: 'gameplaysMentored',
              user: '$mentor',
              date: '$date',
              value: 1,
            },
            {
              field: 'gameplaysMentoredPoints',
              user: '$mentor',
              date: '$date',
              value: {
                $ifNull: [{ $first: '$game.narrationDurationPoint' }, 0],
              },
            },
          ],
        },
      },
      { $unwind: '$actions' },
      { $match: { 'actions.user': { $ne: null } } },
      {
        $group: {
          _id: {
            user: '$actions.user',
            date: '$actions.date',
            field: '$actions.field',
          },
          count: { $sum: '$actions.value' },
        },
      },
    ];
    return this.gameplayModel.aggregate<CountRow>(pipeline).exec();
  }
}
