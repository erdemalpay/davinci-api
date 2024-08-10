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
}

export const DiscountSchema = SchemaFactory.createForClass(Discount);
purifySchema(DiscountSchema);
