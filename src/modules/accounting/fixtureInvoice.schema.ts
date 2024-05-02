import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Brand } from './brand.schema';
import { ExpenseType } from './expenseType.schema';
import { Fixture } from './fixture.schema';
import { PackageType } from './packageType.schema';
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
  location: string;

  @Prop({ required: false, type: String, ref: Vendor.name })
  vendor: string;

  @Prop({ required: true, type: Number })
  totalExpense: number;

  @Prop({ required: false, type: String, ref: PackageType.name })
  packageType: string;

  @Prop({ required: true })
  date: string;

  @Prop({ required: false })
  note: string;
}

export const FixtureInvoiceSchema =
  SchemaFactory.createForClass(FixtureInvoice);

purifySchema(FixtureInvoiceSchema);
