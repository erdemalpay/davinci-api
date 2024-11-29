import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { Product } from './product.schema';
export class CountListsProduct {
  @Prop({ required: true, type: Number, ref: Product.name })
  product: string;

  @Prop({ required: true, type: [{ type: Number, ref: Location.name }] })
  locations: number[];
}

@Schema({ _id: false })
export class CountList extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: Boolean })
  active: boolean;

  @Prop({ required: true, type: [{ type: Number, ref: Location.name }] })
  locations: number[];

  @Prop([CountListsProduct])
  products: CountListsProduct[];
}

export const CountListSchema = SchemaFactory.createForClass(CountList);

purifySchema(CountListSchema);
