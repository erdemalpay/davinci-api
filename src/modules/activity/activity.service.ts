import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import diff from 'microdiff';
import { Document, Model } from 'mongoose';
import { dateRanges } from 'src/utils/dateRanges';
import { withSession } from 'src/utils/withSession';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { SessionOpts } from './../../utils/withSession';
import { ActivityQueryDto, ActivityTypePayload } from './activity.dto';
import { Activity } from './activity.schema';

@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(Activity.name)
    private activityModel: Model<Activity<keyof ActivityTypePayload>>,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  parseLocalDate(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  async getActivities(query: ActivityQueryDto) {
    const {
      page = 1,
      limit = 10,
      user,
      date,
      type,
      after,
      before,
      sort,
      asc,
      search,
    } = query;
    const filter: Record<string, any> = {};
    if (search) {
      filter.$or = [
        { user: { $regex: new RegExp(search, 'i') } },
        { type: { $regex: new RegExp(search, 'i') } },
      ];
    } else {
      if (user) filter.user = user;
      if (type) filter.type = type;
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
        const end = this.parseLocalDate(before);
        end.setHours(23, 59, 59, 999);
        rangeFilter.$lte = end;
      }
      if (Object.keys(rangeFilter).length) {
        filter.createdAt = rangeFilter;
      }
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
    const [data, totalNumber] = await Promise.all([
      this.activityModel
        .find(filter)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .lean()
        .exec(),
      this.activityModel.countDocuments(filter),
    ]);
    const totalPages = Math.ceil(totalNumber / limitNum);
    return {
      data,
      totalNumber,
      totalPages,
      page: pageNum,
      limit: limitNum,
    };
  }

  getActivityById(gameId: number) {
    return this.activityModel.findById(gameId);
  }

  async addActivity<
    T extends keyof ActivityTypePayload,
    P extends ActivityTypePayload[T],
  >(user: User, type: T, payload: P, opts?: SessionOpts) {
    const session = opts?.session;
    const deferEmit =
      opts?.deferEmit ?? Boolean(session && (session as any).inTransaction?.());

    const [activity] = await this.activityModel.create(
      [{ user, type, payload }],
      withSession({}, session),
    );
    if (!deferEmit) {
      this.websocketGateway.emitActivityChanged();
    }

    return activity;
  }

  async addUpdateActivity<
    T extends keyof ActivityTypePayload,
    P extends Document,
  >(user: User, type: T, previousState: P, newState: P) {
    const difs = diff(previousState.toJSON(), newState.toJSON());

    if (!difs.length) return;
    const dif = difs.length > 1 ? difs[1] : difs[0];
    let value = null;
    let oldValue = null;
    if (dif.type === 'CHANGE') {
      value = dif.value;
      oldValue = dif.oldValue;
    } else if (dif.type === 'CREATE') {
      value = dif.value;
    } else if (dif.type === 'REMOVE') {
      oldValue = dif.oldValue;
    }
    const activity = await this.activityModel.create({
      user,
      type,
      payload: {
        target: newState,
        path: dif.path[0],
        value,
        oldValue,
        type: dif.type,
      },
    });
    this.websocketGateway.emitActivityChanged();
    return activity;
  }
}
