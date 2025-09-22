import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Product } from '../accounting/product.schema';
import { Discount } from '../order/discount.schema';
import { ProductCategory } from './../accounting/productCategory.schema';
import { MenuCategory } from './category.schema';
class ItemProduction {
  @Prop()
  quantity: number;

  @Prop({ required: true, type: String, ref: Product.name })
  product: string;

  @Prop({ required: true, type: Boolean, default: true })
  isDecrementStock: boolean;
}
export class PriceHistory {
  @Prop({ required: true, type: Number })
  price: number;

  @Prop({ required: true })
  date: string;
}
@Schema({ _id: false, timestamps: true })
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

  @Prop({ required: false, type: String })
  slug: string;

  @Prop({ required: true, type: Number, ref: MenuCategory.name })
  category: MenuCategory | number;

  @Prop({ required: true, type: Number, default: 0 })
  price: number;

  @Prop({ required: false, type: Number })
  onlinePrice: number;

  @Prop({ required: false, type: Number })
  ikasDiscountedPrice: number;

  @Prop({ required: false, type: Boolean, default: true })
  shownInMenu: boolean;

  @Prop({ required: true, default: [] })
  locations: number[];

  @Prop({
    required: false,
    type: [{ type: String, ref: ProductCategory.name }],
  })
  productCategories: string[];

  @Prop({ required: false, default: [] })
  productImages: string[];

  @Prop({ required: false, type: String, ref: Product.name })
  matchedProduct: string;

  @Prop({ required: false, type: [{ type: Number, ref: Discount.name }] })
  suggestedDiscount: number[];

  @Prop([ItemProduction])
  itemProduction: ItemProduction[];

  @Prop([PriceHistory])
  priceHistory: PriceHistory[];

  @Prop({ required: false, type: String })
  ikasId: string;

  @Prop({ required: false, type: String })
  sku: string;

  @Prop({ required: false, type: String })
  barcode: string;

  @Prop({ required: false, type: Boolean, default: false })
  deleted: boolean;
}

export const MenuItemSchema = SchemaFactory.createForClass(MenuItem);

purifySchema(MenuItemSchema);
