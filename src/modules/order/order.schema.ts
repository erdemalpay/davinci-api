import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { PaymentMethod } from '../accounting/paymentMethod.schema';
import { Location } from '../location/location.schema';
import { MenuItem } from '../menu/item.schema';
import { User } from '../user/user.schema';
import { Kitchen } from './../menu/kitchen.schema';
import { Discount } from './discount.schema';

export class IkasCustomer {
  @Prop({ required: true, type: String })
  id: string;

  @Prop({ required: false, type: String })
  firstName: string;

  @Prop({ required: false, type: String })
  lastName: string;

  @Prop({ required: false, type: String })
  email: string;

  @Prop({ required: false, type: String })
  phone: string;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;
}

@Schema({ _id: false })
export class Order extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: true, type: Number, ref: MenuItem.name })
  item: number;

  @Prop({ required: false, type: String, ref: Kitchen.name })
  kitchen: string;

  @Prop({ required: false, type: Number, ref: 'Table' })
  table: number;

  @Prop({ required: true, type: Number })
  quantity: number;

  @Prop({ required: true, type: String })
  status: string;

  @Prop({ required: false, type: String })
  note: string;

  @Prop({ required: false, type: String })
  activityTableName: string;

  @Prop({ required: false, type: String })
  activityPlayer: string;

  @Prop({ required: true, type: Number })
  unitPrice: number;

  @Prop({ required: false, type: Date })
  confirmedAt: Date;

  @Prop({ required: false, type: String, ref: User.name })
  confirmedBy: string;

  @Prop({ required: true, type: Date })
  createdAt: Date;

  @Prop({ required: true, type: String, ref: User.name })
  createdBy: string;

  @Prop({ required: false, type: Date })
  preparedAt: Date;

  @Prop({ required: false, type: String, ref: User.name })
  preparedBy: string;

  @Prop({ required: false, type: Date })
  deliveredAt: Date;

  @Prop({ required: false, type: String, ref: User.name })
  deliveredBy: string;

  @Prop({ required: false, type: Date })
  cancelledAt: Date;

  @Prop({ required: false, type: String, ref: User.name })
  cancelledBy: string;

  @Prop({ required: true, type: Number })
  paidQuantity: number;

  @Prop({ required: false, type: Boolean })
  isPaymentMade: boolean;

  @Prop({ required: false, type: Number, ref: Discount.name })
  discount?: number;

  @Prop({ required: false, type: Number })
  discountPercentage?: number;

  @Prop({ required: false, type: Number })
  discountAmount?: number;

  @Prop({ required: false, type: String })
  discountNote?: string;

  @Prop({ required: false, type: Number })
  division?: number;

  @Prop({ required: false, type: Boolean })
  isOnlinePrice: boolean;

  @Prop({ required: false, type: Boolean })
  isReturned: boolean;

  @Prop({ required: false, type: Number, ref: Location.name })
  stockLocation: number;

  @Prop({ required: false, type: String, ref: PaymentMethod.name })
  paymentMethod: string;

  @Prop({ required: false, type: String })
  stockNote: string;

  @Prop({ required: false, type: String })
  ikasId: string;

  @Prop({ required: false, type: String })
  ikasOrderNumber: string;

  @Prop({ required: false, type: Date })
  tableDate: Date;

  @Prop({ required: false, type: IkasCustomer })
  ikasCustomer: IkasCustomer;

  @Prop({ required: false, type: Boolean })
  isIkasCustomerPicked: boolean;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index(
  { ikasId: 1 },
  { unique: true, partialFilterExpression: { ikasId: { $type: 'string' } } },
);

purifySchema(OrderSchema);
