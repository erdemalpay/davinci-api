import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Product } from './product.schema';

@Schema({ _id: false })
export class CountList extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: [{ type: String, ref: Product.name }] })
  products: Product[];
}

export const CountListSchema = SchemaFactory.createForClass(CountList);

purifySchema(CountListSchema);
