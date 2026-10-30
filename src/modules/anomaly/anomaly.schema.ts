import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';
import { AnomalySeverity, AnomalyType } from './anomaly.dto';

// Something that happened on a cafe day that usually doesn't, found by the
// daily anomaly report.
@Schema({ _id: false, timestamps: true })
export class Anomaly extends Document {
  @Prop({ type: Number })
  _id: number;

  // The cafe day, "yyyy-MM-dd".
  @Prop({ required: true, index: true })
  date: string;

  @Prop({ required: true, enum: AnomalyType })
  type: AnomalyType;

  @Prop({ required: true, enum: AnomalySeverity })
  severity: AnomalySeverity;

  @Prop({ type: Number, ref: Location.name })
  location?: number;

  // Who it is about.
  @Prop({ type: String, ref: User.name })
  user?: string;

  // Tells the same finding apart when the day is checked again.
  @Prop({ required: true })
  key: string;

  @Prop({ type: Object })
  details: Record<string, unknown>;

  @Prop({ default: false })
  reviewed: boolean;

  @Prop({ type: String, ref: User.name })
  reviewedBy?: string;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  reviewNote?: string;
}

export const AnomalySchema = SchemaFactory.createForClass(Anomaly);

AnomalySchema.index({ date: 1, type: 1, key: 1 }, { unique: true });

purifySchema(AnomalySchema);
