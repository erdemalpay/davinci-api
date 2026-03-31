import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

export enum QuestionType {
  SINGLE_CHOICE = 'single_choice',
  MULTI_CHOICE = 'multi_choice',
  TEXT = 'text',
  CONSENT = 'consent',
}

@Schema({ _id: false, timestamps: true })
export class SurveyQuestion extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number })
  eventId: number;

  @Prop({ required: true, type: String })
  label: string;

  @Prop({ required: true, type: String, enum: QuestionType })
  type: QuestionType;

  @Prop({ required: false, type: [String], default: [] })
  options: string[];

  @Prop({ required: true, type: Boolean, default: false })
  required: boolean;

  @Prop({ required: true, type: Number, default: 0 })
  order: number;

  @Prop({ required: true, type: Boolean, default: true })
  isActive: boolean;
}

export const SurveyQuestionSchema = SchemaFactory.createForClass(SurveyQuestion);
purifySchema(SurveyQuestionSchema);
