import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { User } from '../user/user.schema';
import { Invoice } from './invoice.schema';
import { PaymentMethod } from './paymentMethod.schema';
import { ServiceInvoice } from './serviceInvoice.schema';
import { StockLocation } from './stockLocation.schema';
import { Vendor } from './vendor.schema';

@Schema({ _id: false })
export class Payment extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, ref: Vendor.name })
  vendor: string;

  @Prop({ required: false, type: String, ref: Invoice.name })
  invoice: number;

  @Prop({ required: true, type: String, ref: StockLocation.name })
  location: string;

  @Prop({ required: false, type: String, ref: ServiceInvoice.name })
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
