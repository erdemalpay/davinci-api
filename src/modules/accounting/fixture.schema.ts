import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Brand } from './brand.schema';
import { ExpenseType } from './expenseType.schema';
import { Vendor } from './vendor.schema';

@Schema({ _id: false })
export class Fixture extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ type: Number })
  unitPrice: number;

  @Prop({ required: true, type: [{ type: String, ref: ExpenseType.name }] })
  expenseType: ExpenseType[];

  @Prop({ required: false, type: [{ type: String, ref: Brand.name }] })
  brand: Brand[];

  @Prop({ required: false, type: [{ type: String, ref: Vendor.name }] })
  vendor: Vendor[];
}

export const FixtureSchema = SchemaFactory.createForClass(Fixture);

purifySchema(FixtureSchema);
