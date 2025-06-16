import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import diff from 'microdiff';
import { Document, Model } from 'mongoose';
import { dateRanges } from 'src/utils/dateRanges';
import { User } from '../user/user.schema';
import { ActivityQueryDto, ActivityTypePayload } from './activity.dto';
import { ActivityGateway } from './activity.gateway';
import { Activity } from './activity.schema';

@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(Activity.name)
    private activityModel: Model<Activity<keyof ActivityTypePayload>>,
    private readonly activityGateway: ActivityGateway,
  ) {}

  parseLocalDate(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  async getActivities(query: ActivityQueryDto) {
    const { user, date, type, after, before } = query;
    const filter: any = {};

    if (user) filter.user = user;
    if (type) filter.type = type;

    if (date && dateRanges[date]) {
      const { after: dAfter, before: dBefore } = dateRanges[date]();
      const start = this.parseLocalDate(dAfter);
      const end = this.parseLocalDate(dBefore);
      end.setHours(23, 59, 59, 999);

      filter.createdAt = { $gte: start, $lte: end };
    } else {
      const rangeFilter: any = {};

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
    return this.activityModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  getActivityById(gameId: number) {
    return this.activityModel.findById(gameId);
  }

  async addActivity<
    T extends keyof ActivityTypePayload,
    P extends ActivityTypePayload[T],
  >(user: User, type: T, payload: P) {
    const activity = await this.activityModel.create({
      user,
      type,
      payload,
    });
    this.activityGateway.emitActivityChanged(activity);
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
    this.activityGateway.emitActivityChanged(activity);
    return activity;
  }
}
