import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Product } from '../accounting/product.schema';
import { MenuCategory } from './category.schema';
class ItemProduction {
  @Prop()
  quantity: number;

  @Prop({ required: true, type: Number, ref: Product.name })
  product: string;
}
@Schema({ _id: false })
export class MenuItem extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ type: String })
  description: string;

  @Prop({ type: String })
  imageUrl: string;

  @Prop({ required: true, type: Number })
  order: number;

  @Prop({ required: true, type: Number, ref: MenuCategory.name })
  category: MenuCategory;

  @Prop({ required: true, type: Number, default: 0 })
  priceBahceli: number;

  @Prop({ required: true, type: Number, default: 0 })
  priceNeorama: number;

  @Prop([ItemProduction])
  itemProduction: ItemProduction[];
}

export const MenuItemSchema = SchemaFactory.createForClass(MenuItem);

purifySchema(MenuItemSchema);
