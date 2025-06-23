import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';
import { Expense } from './expense.schema';
import { PaymentMethod } from './paymentMethod.schema';
import { Vendor } from './vendor.schema';

@Schema({ _id: false, timestamps: true })
export class Payment extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, ref: Vendor.name })
  vendor: string;

  @Prop({ required: false, type: String, ref: Expense.name })
  invoice: number;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: false, type: String, ref: Expense.name })
  serviceInvoice: number;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: true, type: String, ref: PaymentMethod.name })
  paymentMethod: string;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true, type: Number })
  amount: number;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

purifySchema(PaymentSchema);
