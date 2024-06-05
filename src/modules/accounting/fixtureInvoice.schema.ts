import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { User } from '../user/user.schema';
import { Brand } from './brand.schema';
import { ExpenseType } from './expenseType.schema';
import { Fixture } from './fixture.schema';
import { PackageType } from './packageType.schema';
import { PaymentMethod } from './paymentMethod.schema';
import { StockLocation } from './stockLocation.schema';
import { Vendor } from './vendor.schema';

@Schema({ _id: false })
export class FixtureInvoice extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, ref: ExpenseType.name })
  expenseType: string;

  @Prop({ required: true, type: String, ref: Fixture.name })
  fixture: string;

  @Prop({ required: true, type: Number })
  quantity: number;

  @Prop({ required: false, type: String, ref: Brand.name })
  brand: string;

  @Prop({ required: true, type: String, ref: StockLocation.name })
  location: string | number;

  @Prop({ required: false, type: String, ref: Vendor.name })
  vendor: string;

  @Prop({ required: true, type: Number })
  totalExpense: number;

  @Prop({ required: false, type: String, ref: PackageType.name })
  packageType: string;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true, type: Boolean })
  isPaid: boolean;

  @Prop({ required: false, type: String, ref: PaymentMethod.name })
  paymentMethod: string;

  @Prop({ required: false })
  note: string;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;
}

export const FixtureInvoiceSchema =
  SchemaFactory.createForClass(FixtureInvoice);

purifySchema(FixtureInvoiceSchema);
