import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

export class SurveyAnswer {
  questionId: number;
  questionLabel: string;
  answer: string | string[];
}

@Schema({ _id: false, timestamps: true })
export class SurveyResponse extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number })
  eventId: number;

  @Prop({ required: false, type: String, default: '' })
  fullName: string;

  @Prop({ required: true, type: String })
  email: string;

  @Prop({ required: true, type: Boolean, default: false })
  emailMarketingConsent: boolean;

  @Prop({ required: false, type: [Object], default: [] })
  answers: SurveyAnswer[];
}

export const SurveyResponseSchema = SchemaFactory.createForClass(SurveyResponse);
SurveyResponseSchema.index({ eventId: 1, email: 1 }, { unique: true });
purifySchema(SurveyResponseSchema);
