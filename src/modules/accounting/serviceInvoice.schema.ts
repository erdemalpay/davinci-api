import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { ExpenseType } from './expenseType.schema';
import { Service } from './service.schema';
import { Vendor } from './vendor.schema';

@Schema({ _id: false })
export class ServiceInvoice extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, ref: ExpenseType.name })
  expenseType: string;

  @Prop({ required: true, type: String, ref: Service.name })
  service: string;

  @Prop({ required: true, type: Number })
  quantity: number;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: false, type: String, ref: Vendor.name })
  vendor: string;

  @Prop({ required: true, type: Number })
  totalExpense: number;

  @Prop({ required: true })
  date: string;

  @Prop({ required: false })
  note: string;
}

export const ServiceInvoiceSchema =
  SchemaFactory.createForClass(ServiceInvoice);

purifySchema(ServiceInvoiceSchema);
