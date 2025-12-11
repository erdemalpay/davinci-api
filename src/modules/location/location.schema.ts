import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

export class LocationShift {
  @Prop({ required: true, type: String })
  shift: string;

  @Prop({ required: true, type: String })
  shiftEndHour: string;

  @Prop({ required: true, type: Boolean })
  isActive: boolean;

  @Prop({ required: false, type: String })
  type: string;
}

export class DailyHours {
  @Prop({ required: true, type: String })
  day: string;

  @Prop({ required: false, type: String })
  openingTime?: string;

  @Prop({ required: false, type: String })
  closingTime?: string;

  @Prop({ required: false, type: Boolean, default: false })
  isClosed?: boolean;
}
@Schema({ _id: false })
export class Location extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, index: true })
  name: string;

  @Prop({ required: true, default: true })
  active: boolean;

  @Prop({ required: false, index: true })
  activityNote: string;

  @Prop({ required: true, default: [1] })
  type: number[];

  @Prop({ required: false, index: true })
  tableCount: string;

  @Prop({ required: false, type: String })
  ikasId: string;

  @Prop({ required: false, type: String })
  backgroundColor: string;

  @Prop({ required: false, type: Boolean })
  isShelfInfoRequired: boolean;

  @Prop({ required: false, type: Boolean, default: false })
  seenInOrdersSummaryPage: boolean;

  @Prop([LocationShift])
  shifts: LocationShift[];

  @Prop({ type: [String], required: false })
  tableNames?: string[];

  @Prop({ type: String, required: false })
  phoneNumber?: string;

  @Prop({ type: String, required: false })
  googleMapsUrl?: string;

  @Prop([DailyHours])
  dailyHours?: DailyHours[];
}

export const LocationSchema = SchemaFactory.createForClass(Location);

purifySchema(LocationSchema);
