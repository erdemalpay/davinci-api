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

// Indexes for frequent queries
// For getUniqueVisits() - date range queries with user and startHour sorting
VisitSchema.index({ date: 1, user: 1, startHour: 1 });
// For getVisits() - user and date queries
VisitSchema.index({ user: 1, date: 1 });
// For location and date queries
VisitSchema.index({ location: 1, date: 1 });
// For date range queries
VisitSchema.index({ date: 1 });

purifySchema(VisitSchema);
