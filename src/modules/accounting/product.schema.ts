import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Brand } from './brand.schema';
import { ExpenseType } from './expenseType.schema';
import { Vendor } from './vendor.schema';

export class BaseQuantityByLocation {
  @Prop({ required: true, type: Number })
  minQuantity: number;

  @Prop({ required: true, type: Number })
  maxQuantity: number;

  @Prop({ required: true, type: Number, ref: 'Location' })
  location: number;
}

export class ProductShelfInfo {
  @Prop({ required: true, type: Number, ref: 'Location' })
  location: number;

  @Prop({ required: true, type: String })
  shelf: string;
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
  expenseType: string[];

  @Prop({ required: false, type: [{ type: String, ref: Brand.name }] })
  brand: string[];

  @Prop({ required: false, type: [{ type: String, ref: Vendor.name }] })
  vendor: string[];

  @Prop({ required: true, default: false, type: Boolean, index: true })
  deleted: boolean;

  @Prop({ required: false, type: Number, ref: 'MenuItem' })
  matchedMenuItem: number;

  @Prop([BaseQuantityByLocation])
  baseQuantities: BaseQuantityByLocation[];

  @Prop([ProductShelfInfo])
  shelfInfo: ProductShelfInfo[];
}

export const ProductSchema = SchemaFactory.createForClass(Product);

purifySchema(ProductSchema);
