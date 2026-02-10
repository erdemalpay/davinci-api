import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
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

  @Prop({ required: false, type: Number, ref: 'Table', index: true })
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

  @Prop({ required: false, type: String, ref: User.name })
  pointUser: string;

  @Prop({ required: false, type: Number, ref: 'Consumer' })
  pointConsumer: number;

  @Prop([OrderCollectionItem])
  orders: OrderCollectionItem[];

  @Prop({ required: false, type: String })
  activityPlayer: string;

  @Prop({ required: false, type: String })
  ikasId: string;

  @Prop({ required: false, type: String })
  shopifyId: string;

  @Prop({ required: false, type: String })
  ikasOrderNumber: string;

  @Prop({ required: false, type: String })
  shopifyOrderNumber: string;

  @Prop({ required: false, type: Number })
  shopifyShippingAmount: number;

  @Prop({ required: false, type: Number })
  shopifyDiscountAmount: number;
  @Prop({ required: false, type: String })
  trendyolOrderNumber: string;

  @Prop({ required: false, type: String })
  trendyolShipmentPackageId: string;

  @Prop({ required: false, type: String })
  hepsiburadaOrderNumber: string;

  @Prop({ required: false, type: Date })
  tableDate: Date;
}

export const CollectionSchema = SchemaFactory.createForClass(Collection);

// Indexes for frequent queries
// For findPersonalCollectionNumbers() - createdAt range with status
CollectionSchema.index({ createdAt: 1, status: 1 });
// For createdBy queries
CollectionSchema.index({ createdBy: 1, createdAt: -1 });
// For tableDate queries
CollectionSchema.index({ tableDate: 1, location: 1 });
// For status queries
CollectionSchema.index({ status: 1, location: 1 });
// For Trendyol shipment package queries
CollectionSchema.index(
  { trendyolShipmentPackageId: 1 },
  { partialFilterExpression: { trendyolShipmentPackageId: { $type: 'string' } } },
);
// For Hepsiburada order number queries
CollectionSchema.index(
  { hepsiburadaOrderNumber: 1 },
  { partialFilterExpression: { hepsiburadaOrderNumber: { $type: 'string' } } },
);

purifySchema(CollectionSchema);
