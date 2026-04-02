import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

export enum EventStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

@Schema({ _id: false, timestamps: true })
export class SurveyEvent extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: String, unique: true })
  slug: string;

  @Prop({ required: true, type: String, enum: EventStatus, default: EventStatus.DRAFT })
  status: EventStatus;

  @Prop({ required: false, type: Date })
  startAt: Date;

  @Prop({ required: false, type: Date })
  endAt: Date;

  @Prop({ required: true, type: Boolean, default: true })
  isActive: boolean;

  @Prop({ required: false, type: String })
  location: string;

  @Prop({ required: false, type: String })
  stand: string;

  @Prop({ required: true, type: String })
  rewardLabel: string;

  @Prop({ required: true, type: Number, default: 7 })
  codeValidityDays: number;

  @Prop({ required: false, type: Boolean, default: false })
  isDeleted: boolean;
}

export const SurveyEventSchema = SchemaFactory.createForClass(SurveyEvent);
purifySchema(SurveyEventSchema);
