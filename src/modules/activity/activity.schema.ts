import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from '../../lib/purifySchema';
import { User } from '../user/user.schema';
import { ActivityTypePayload } from './activity.dto';
@Schema({ _id: false, timestamps: true })
export class Activity<T extends keyof ActivityTypePayload> extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, ref: User.name })
  user: User;

  @Prop()
  type: T;

  @Prop({ type: Object })
  payload: ActivityTypePayload[T];
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);

purifySchema(ActivitySchema);
