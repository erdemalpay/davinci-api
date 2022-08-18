import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { MenuCategory } from './category.schema';

@Schema({ _id: false })
export class MenuItem extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: Number, ref: MenuCategory.name })
  category: MenuCategory;

  @Prop({ required: true, type: Number, default: 0 })
  priceBahceli: number;

  @Prop({ required: true, type: Number, default: 0 })
  priceNeorama: number;
}

export const MenuItemSchema = SchemaFactory.createForClass(MenuItem);

purifySchema(MenuItemSchema);
