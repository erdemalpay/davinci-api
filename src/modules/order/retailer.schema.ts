import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Order } from './order.schema';

@Schema({ _id: false })
export class Retailer extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: false, type: [Number], ref: Order.name, default: [] })
  orders: number[];
}

export const RetailerSchema = SchemaFactory.createForClass(Retailer);
purifySchema(RetailerSchema);
