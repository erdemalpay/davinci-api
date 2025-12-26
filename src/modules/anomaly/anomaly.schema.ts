import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { User } from '../user/user.schema';
import { AnomalyType, AnomalySeverity } from './anomaly.dto';

@Schema({ _id: false })
export class Anomaly extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: true, enum: AnomalyType })
  type: AnomalyType;

  @Prop({ required: true, enum: AnomalySeverity })
  severity: AnomalySeverity;

  @Prop({ required: true, type: String })
  description: string;

  @Prop({ required: true, type: Date, default: () => new Date() })
  detectedAt: Date;

  @Prop({ required: true, type: Date })
  incidentDate: Date;

  @Prop({ required: false, type: Object })
  metadata?: Record<string, any>;

  @Prop({ required: false, type: Boolean, default: false })
  isReviewed: boolean;

  @Prop({ required: false, type: String })
  reviewedBy?: string;

  @Prop({ required: false, type: Date })
  reviewedAt?: Date;
}

export const AnomalySchema = SchemaFactory.createForClass(Anomaly);

