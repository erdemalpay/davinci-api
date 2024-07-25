import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { Collection } from './collection.schema';
import { Discount } from './discount.schema';
import { Order } from './order.schema';

export class OrderPaymentItem {
  @Prop({ required: true, type: Number, ref: Order.name })
  order: number;

  @Prop({ required: true, type: Number })
  paidQuantity: number;

  @Prop({ required: true, type: Number })
  totalQuantity: number;

  @Prop({ required: false, type: Number, ref: Discount.name })
  discount: number;

  @Prop({ required: false, type: Number })
  discountPercentage: number;
}

@Schema({ _id: false })
export class OrderPayment extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: true, type: Number, ref: 'Table' })
  table: number;

  @Prop({ required: false, type: [{ type: Number, ref: Collection.name }] })
  collections: number[];

  @Prop([OrderPaymentItem])
  orders: OrderPaymentItem[];

  @Prop({ required: true, type: Number })
  totalAmount: number;

  @Prop({ required: true, type: Number })
  discountAmount: number;
}

export const OrderPaymentSchema = SchemaFactory.createForClass(OrderPayment);
purifySchema(OrderPaymentSchema);
