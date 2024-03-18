import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Brand } from './brand.schema';
import { ExpenseType } from './expenseType.schema';
import { Product } from './product.schema';
import { Vendor } from './vendor.schema';

@Schema({ _id: false })
export class Invoice extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, ref: Product.name })
  product: Product;

  @Prop({ required: true, type: String, ref: ExpenseType.name })
  expenseType: ExpenseType;

  @Prop({ required: true, type: Number })
  quantity: number;

  @Prop({ required: true, type: Number })
  totalExpense: number;

  @Prop({ required: true })
  date: string;

  @Prop({ required: false, type: String, ref: Brand.name })
  brand: Brand;

  @Prop({ required: false, type: String, ref: Vendor.name })
  vendor: Vendor;

  @Prop({ required: false })
  documentNo: string;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

purifySchema(InvoiceSchema);
