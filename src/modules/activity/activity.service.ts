import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import diff from 'microdiff';
import { Document, Model } from 'mongoose';
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

  async getActivities(query: ActivityQueryDto) {
    const filterQuery: any = {};
    const { user, date, type, page, limit, sort, asc } = query;
    if (user) {
      filterQuery['user'] = user;
    }
    if (date) {
      const [year, month, day] = date.split('-').map(Number);
      const startDate = new Date(year, month - 1, day, 0, 0, 0);
      const endDate = new Date(year, month - 1, day, 23, 59, 59);
      filterQuery['createdAt'] = { $gte: startDate, $lte: endDate };
    }
    if (type) {
      filterQuery['type'] = type;
    }
    const sortObject = {};
    if (sort) {
      sortObject[sort] = asc ? 1 : -1;
    } else {
      sortObject['createdAt'] = -1;
    }
    const totalCount = await this.activityModel.countDocuments(filterQuery);
    const items = await this.activityModel
      .find(filterQuery)
      .sort(sortObject)
      .skip(page ? (page - 1) * limit : 0)
      .limit(limit || 0)
      .populate({
        path: 'user',
        select: '-password',
      });

    return { totalCount, items };
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
