import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { Collection } from './collection.schema';
import { Order } from './order.schema';

@Schema({ _id: false })
export class Payment extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: true, type: Number, ref: 'Table' })
  table: number;

  @Prop({ required: true, type: [{ type: Number, ref: Collection.name }] })
  collections: number[];

  @Prop({ required: true, type: [{ type: Number, ref: Order.name }] })
  unpaidOrders: number[];

  @Prop({ required: true, type: [{ type: Number, ref: Order.name }] })
  paidOrders: number[];

  @Prop({ required: true, type: Number })
  discount: number;

  @Prop({ required: true, type: Number })
  totalAmount: number;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
purifySchema(PaymentSchema);
