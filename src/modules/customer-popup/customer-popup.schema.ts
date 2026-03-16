import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

export enum TriggerType {
  PERIODIC = 'periodic',
  SPECIAL_DAY = 'special_day',
  BOTH = 'both',
}

@Schema({ _id: false, timestamps: true })
export class CustomerPopup extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  title: string;

  @Prop({ required: true, type: String })
  content: string;

  @Prop({ required: false, type: String })
  imageUrl: string;

  @Prop({ required: true, type: Boolean, default: true })
  isActive: boolean;

  @Prop({ required: true, type: String, enum: TriggerType })
  triggerType: TriggerType;

  // [1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun] ISO weekday
  @Prop({ required: false, default: [], type: [Number] })
  periodicDays: number[];

  // "MM-DD" format, e.g. "02-14" for Valentine's Day
  @Prop({ required: false, type: String })
  specialDate: string;

  @Prop({ required: false, type: Number, default: 24 })
  cooldownHours: number;

  @Prop({ required: true, default: [] })
  locations: number[];

  @Prop({ required: false, type: Boolean, default: false })
  isDeleted: boolean;
}

export const CustomerPopupSchema =
  SchemaFactory.createForClass(CustomerPopup);
purifySchema(CustomerPopupSchema);
