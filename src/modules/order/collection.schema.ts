import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { StockLocation } from '../accounting/stockLocation.schema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';
import { PaymentMethod } from './../accounting/paymentMethod.schema';
import { Order } from './order.schema';
export class OrderCollectionItem {
  @Prop({ required: true, type: Number, ref: Order.name })
  order: number;

  @Prop({ required: true, type: Number })
  paidQuantity: number;
}
@Schema({ _id: false })
export class Collection extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: Location.name, index: true })
  location: number;

  @Prop({ required: true, type: Date })
  createdAt: Date;

  @Prop({ required: true, type: String, ref: User.name })
  createdBy: string;

  @Prop({ required: true, type: Number, ref: 'Table', index: true })
  table: number;

  @Prop({ required: false, type: Date })
  cancelledAt: Date;

  @Prop({ required: false, type: String, ref: User.name })
  cancelledBy: string;

  @Prop({ required: true, type: Number })
  amount: number;

  @Prop({ required: true, type: String })
  status: string;

  @Prop({ required: false, type: String })
  cancelNote: string;

  @Prop({ required: true, type: String, ref: PaymentMethod.name })
  paymentMethod: string;

  @Prop([OrderCollectionItem])
  orders: OrderCollectionItem[];

  @Prop({ required: false, type: String, ref: StockLocation.name })
  stockLocation: string;
}

export const CollectionSchema = SchemaFactory.createForClass(Collection);

purifySchema(CollectionSchema);
