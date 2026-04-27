import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false, timestamps: true })
export class MonthlyActivity extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  imageUrl: string;

  @Prop({ required: false, type: String })
  monthInfo?: string;
}

export const MonthlyActivitySchema =
  SchemaFactory.createForClass(MonthlyActivity);
purifySchema(MonthlyActivitySchema);