import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class Discount extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: false, type: Number })
  percentage: number;

  @Prop({ required: false, type: Number })
  amount: number;

  @Prop({ required: false, type: String })
  note: string;

  @Prop({ required: false, type: Boolean, default: false })
  isOnlineOrder: boolean;

  @Prop({ required: false, type: Boolean, default: false })
  isNoteRequired: boolean;

  @Prop({ required: false, type: String })
  status: string;
}

export const DiscountSchema = SchemaFactory.createForClass(Discount);
purifySchema(DiscountSchema);
