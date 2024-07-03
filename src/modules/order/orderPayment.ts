import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { Collection } from './collection.schema';
import { Order } from './order.schema';

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

  @Prop({ required: false, type: [{ type: Number, ref: Order.name }] })
  unpaidOrders: number[];

  @Prop({ required: false, type: [{ type: Number, ref: Order.name }] })
  paidOrders: number[];

  @Prop({ required: false, type: Number })
  discount: number;

  @Prop({ required: true, type: Number })
  totalAmount: number;
}

export const OrderPaymentSchema = SchemaFactory.createForClass(OrderPayment);
purifySchema(OrderPaymentSchema);
