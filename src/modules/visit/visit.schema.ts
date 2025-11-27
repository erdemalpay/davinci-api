import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';
import { VisitSource } from './visit.dto';

@Schema({ _id: false })
export class Visit extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, ref: User.name })
  user: User;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: Location;

  @Prop({ required: true })
  date: string;

  @Prop()
  startHour: string;

  @Prop()
  finishHour: string;

  @Prop({ type: String, enum: VisitSource })
  visitStartSource: VisitSource;

  @Prop({ type: String, enum: VisitSource })
  visitFinishSource: VisitSource;

  @Prop({ type: Boolean, default: false })
  notificationSent: boolean;
}

export const VisitSchema = SchemaFactory.createForClass(Visit);

purifySchema(VisitSchema);
