import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import diff from 'microdiff';
import { Document, Model } from 'mongoose';
import { User } from '../user/user.schema';
import { ActivityTypePayload } from './activity.dto';
import { Activity } from './activity.schema';

@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(Activity.name)
    private activityModel: Model<Activity<keyof ActivityTypePayload>>,
  ) {}

  getActivites() {
    return this.activityModel.find();
  }

  getActivityById(gameId: number) {
    return this.activityModel.findById(gameId);
  }

  async addActivity<
    T extends keyof ActivityTypePayload,
    P extends ActivityTypePayload[T],
  >(user: User, type: T, payload: P) {
    return this.activityModel.create({
      user,
      type,
      payload,
    });
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
    return this.activityModel.create({
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
  }
}
