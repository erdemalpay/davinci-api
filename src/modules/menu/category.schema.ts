import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Discount } from './../order/discount.schema';
import { Kitchen } from './kitchen.schema';
@Schema({ _id: false })
export class MenuCategory extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: Number })
  order: number;

  @Prop({ required: true, default: [] })
  locations: number[];

  @Prop({ required: true, type: String, ref: Kitchen.name })
  kitchen: string;

  @Prop({ required: false, type: [{ type: Number, ref: Discount.name }] })
  discounts: number[];

  @Prop({ required: true, type: Boolean, default: false })
  isAutoServed: boolean;

  @Prop({ required: false, type: Boolean, default: false })
  isOnlineOrder: boolean;

  @Prop({ type: String })
  imageUrl: string;
}

export const MenuCategorySchema = SchemaFactory.createForClass(MenuCategory);

purifySchema(MenuCategorySchema);
