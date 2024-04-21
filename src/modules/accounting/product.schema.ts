import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Brand } from './brand.schema';
import { ExpenseType } from './expenseType.schema';
import { StockType } from './stockType.schema';
import { Unit } from './unit.schema';
import { Vendor } from './vendor.schema';

class PackageType {
  @Prop({ required: true, type: Number })
  packageUnitPrice: number;

  @Prop({ required: true, type: String, ref: PackageType.name })
  package: string;
}
@Schema({ _id: false })
export class Product extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ type: Number })
  unitPrice: number;

  @Prop({ required: true, type: [{ type: String, ref: ExpenseType.name }] })
  expenseType: ExpenseType[];

  @Prop({ required: true, type: String, ref: StockType.name })
  stockType: StockType;

  @Prop({ required: false, type: [{ type: String, ref: Brand.name }] })
  brand: Brand[];

  @Prop({ required: false, type: [{ type: String, ref: Vendor.name }] })
  vendor: Vendor[];

  @Prop({ required: true, type: String, ref: Unit.name })
  unit: Unit;

  @Prop([PackageType])
  packages: PackageType[];
}

export const ProductSchema = SchemaFactory.createForClass(Product);

purifySchema(ProductSchema);
