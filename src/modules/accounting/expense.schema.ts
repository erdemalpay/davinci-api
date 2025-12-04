import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';
import { Brand } from './brand.schema';
import { ExpenseType } from './expenseType.schema';
import { PaymentMethod } from './paymentMethod.schema';
import { Product } from './product.schema';
import { Service } from './service.schema';
import { Vendor } from './vendor.schema';

@Schema({ _id: false, timestamps: true })
export class Expense extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: false, type: String, ref: Product.name })
  product: string;

  @Prop({ required: false, type: String, ref: Service.name })
  service: string;

  @Prop({ required: true, type: String, ref: ExpenseType.name })
  expenseType: string;

  @Prop({ required: true, type: Number })
  quantity: number;

  @Prop({ required: false, type: Number })
  discount: number;

  @Prop({ required: false, type: Number })
  vat: number;

  @Prop({ required: true, type: Number })
  totalExpense: number;

  @Prop({ required: true })
  date: string;

  @Prop({ required: false, type: String, ref: Brand.name })
  brand: string;

  @Prop({ required: false, type: String, ref: Vendor.name })
  vendor: string;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: true, type: Boolean })
  isPaid: boolean;

  @Prop({ required: false, type: String, ref: PaymentMethod.name })
  paymentMethod: string;

  @Prop({ required: false })
  note: string;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: false, type: Boolean })
  isStockIncrement: boolean;

  @Prop({ required: true, type: Boolean, default: true })
  isAfterCount: boolean;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);

// Indexes for frequent queries
// For findAllExpenseWithPagination() - date range queries with location
ExpenseSchema.index({ date: 1, location: 1 });
// For findAllExpenseWithPagination() - expenseType queries
ExpenseSchema.index({ expenseType: 1, location: 1 });
// For findAllExpenseWithPagination() - paymentMethod queries
ExpenseSchema.index({ paymentMethod: 1, location: 1 });
// For findAllExpenseWithPagination() - user queries
ExpenseSchema.index({ user: 1, date: 1 });
// For findAllExpenseWithPagination() - product queries
ExpenseSchema.index({ product: 1, location: 1 });
// For findAllExpenseWithPagination() - service queries
ExpenseSchema.index({ service: 1, location: 1 });
// For findAllExpenseWithPagination() - type queries
ExpenseSchema.index({ type: 1, location: 1 });

purifySchema(ExpenseSchema);
