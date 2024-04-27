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
  expenseType: ExpenseType;

  @Prop({ required: true, type: String, ref: Service.name })
  service: Service;

  @Prop({ required: true, type: Number })
  quantity: number;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: Location;

  @Prop({ required: false, type: String, ref: Vendor.name })
  vendor: Vendor;

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
