import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';
import { Product } from './product.schema';

@Schema({ _id: false })
export class ProductStockHistory extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, ref: Product.name })
  product: string;

  @Prop({ required: true, type: String, ref: Location.name })
  location: any;

  @Prop({ required: true, type: Number })
  change: number;

  @Prop({ required: true, type: Number })
  currentAmount: number;

  @Prop({ required: true, type: String })
  status: string;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: true, type: Date })
  createdAt: Date;
}

export const ProductStockHistorySchema =
  SchemaFactory.createForClass(ProductStockHistory);

purifySchema(ProductStockHistorySchema);
