import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { MenuItem } from '../menu/item.schema';
import { Retailer } from './retailer.schema';

@Schema({ _id: false })
export class RetailerOrderRequestProduct extends Document {
  @Prop({ required: true, type: String })
  productId: string;

  @Prop({ required: true, type: Number, ref: MenuItem.name })
  productDavinciId: number;

  @Prop({ required: true, type: Number })
  quantity: number;
}

@Schema({ _id: false, timestamps: true })
export class RetailerOrderRequest extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: Retailer.name, index: true })
  retailerId: number;

  @Prop({ required: true, type: String })
  orderId: string;

  @Prop({ required: true, type: Date, index: true })
  date: Date;

  @Prop({ required: true, type: String, index: true })
  status: string;

  @Prop({ type: [RetailerOrderRequestProduct], default: [] })
  products: RetailerOrderRequestProduct[];
}

export const RetailerOrderRequestSchema =
  SchemaFactory.createForClass(RetailerOrderRequest);

purifySchema(RetailerOrderRequestSchema);
