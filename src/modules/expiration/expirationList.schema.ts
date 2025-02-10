import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Product } from '../accounting/product.schema';
import { Location } from '../location/location.schema';

export class ExpirationListsProduct {
  @Prop({ required: true, type: Number, ref: Product.name })
  product: string;

  @Prop({ required: true, type: [{ type: Number, ref: Location.name }] })
  locations: number[];
}

@Schema({ _id: false })
export class ExpirationList extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: Boolean })
  active: boolean;

  @Prop({ required: true, type: [{ type: Number, ref: Location.name }] })
  locations: number[];

  @Prop([ExpirationListsProduct])
  products: ExpirationListsProduct[];
}

export const ExpirationListSchema =
  SchemaFactory.createForClass(ExpirationList);

purifySchema(ExpirationListSchema);
