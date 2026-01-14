import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class ProductCategory extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: false, type: String })
  ikasId: string;

  @Prop({ required: false, type: String })
  shopifyId: string;
}

export const ProductCategorySchema =
  SchemaFactory.createForClass(ProductCategory);

purifySchema(ProductCategorySchema);
