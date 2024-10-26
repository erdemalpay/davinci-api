import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Product } from './product.schema';
import { StockLocation } from './stockLocation.schema';

export class CountListsProduct {
  @Prop({ required: true, type: Number, ref: Product.name })
  product: string;

  @Prop({ required: true, type: [{ type: String, ref: StockLocation.name }] })
  locations: string[];
}

@Schema({ _id: false })
export class CountList extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: Boolean })
  active: boolean;

  @Prop({ required: true, type: [{ type: String, ref: StockLocation.name }] })
  locations: string[];

  @Prop([CountListsProduct])
  products: CountListsProduct[];
}

export const CountListSchema = SchemaFactory.createForClass(CountList);

purifySchema(CountListSchema);
