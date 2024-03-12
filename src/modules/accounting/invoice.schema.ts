import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { ExpenseType } from './expenseType.schema';
import { Product } from './product.schema';

@Schema({ _id: false })
export class Invoice extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: Product.name })
  product: Product;

  @Prop({ required: true, type: Number, ref: ExpenseType.name })
  expenseType: ExpenseType;

  @Prop({ required: true, type: Number })
  quantity: number;

  @Prop({ required: true, type: Number })
  totalExpense: number;

  @Prop({ required: true })
  date: string;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

purifySchema(InvoiceSchema);
