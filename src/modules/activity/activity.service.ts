import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ActivityType, ActivityTypePayload } from './activity.dto';
import { Activity } from './activity.schema';

@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(Activity.name)
    private activityModel: Model<Activity<ActivityType>>,
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
  >(type: T, payload: P) {
    // const gameDetails = await getGameDetails(gameId);
    return this.activityModel.create({
      type,
    });
  }
}
