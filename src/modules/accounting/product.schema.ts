import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Brand } from './brand.schema';
import { ExpenseType } from './expenseType.schema';
import { Unit } from './unit.schema';
import { Vendor } from './vendor.schema';

@Schema({ _id: false })
export class Product extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ type: Number })
  unitPrice: number;

  @Prop({ required: true, type: [{ type: Number, ref: ExpenseType.name }] })
  expenseType: ExpenseType[];

  @Prop({ required: true, type: [{ type: Number, ref: Brand.name }] })
  brand: Brand[];

  @Prop({ required: true, type: [{ type: Number, ref: Vendor.name }] })
  vendor: Vendor[];

  @Prop({ required: true, type: Number, ref: Unit.name })
  unit: Unit;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

purifySchema(ProductSchema);
