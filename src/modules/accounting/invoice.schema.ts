import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { Brand } from './brand.schema';
import { ExpenseType } from './expenseType.schema';
import { PackageType } from './packageType.schema';
import { Product } from './product.schema';
import { Vendor } from './vendor.schema';

@Schema({ _id: false })
export class Invoice extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, ref: Product.name })
  product: string;

  @Prop({ required: true, type: String, ref: ExpenseType.name })
  expenseType: string;

  @Prop({ required: true, type: Number })
  quantity: number;

  @Prop({ required: true, type: Number })
  totalExpense: number;

  @Prop({ required: true })
  date: string;

  @Prop({ required: false, type: String, ref: Brand.name })
  brand: string;

  @Prop({ required: false, type: String, ref: Vendor.name })
  vendor: string;

  @Prop({ required: false, type: String, ref: PackageType.name })
  packageType: string;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: false })
  note: string;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

purifySchema(InvoiceSchema);
