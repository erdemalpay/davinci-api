import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';

@Schema({ _id: false, timestamps: true })
export class Break extends Document {
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
}

export const BreakSchema = SchemaFactory.createForClass(Break);

// Indexes for frequent queries
// For date range queries with user and startHour sorting
BreakSchema.index({ date: 1, user: 1, startHour: 1 });
// For user and date queries
BreakSchema.index({ user: 1, date: 1 });
// For location and date queries
BreakSchema.index({ location: 1, date: 1 });
// For date range queries
BreakSchema.index({ date: 1 });

purifySchema(BreakSchema);
