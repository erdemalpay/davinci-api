import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Brand } from './brand.schema';
import { ExpenseType } from './expenseType.schema';
import { PackageType } from './product.schema';
import { Unit } from './unit.schema';
import { Vendor } from './vendor.schema';

@Schema({ _id: false })
export class Fixture extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: false, type: [{ type: String, ref: Brand.name }] })
  brand: string[];

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ type: Number })
  unitPrice: number;

  @Prop({ required: false, type: [{ type: String, ref: Vendor.name }] })
  vendor: string[];

  @Prop({ required: true, type: [{ type: String, ref: ExpenseType.name }] })
  expenseType: string[];

  @Prop({ required: false, type: String, ref: Unit.name })
  unit: string;

  @Prop([PackageType])
  packages: PackageType[];
}

export const FixtureSchema = SchemaFactory.createForClass(Fixture);

purifySchema(FixtureSchema);
