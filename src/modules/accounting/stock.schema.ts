import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { Product } from './product.schema';

@Schema({ _id: false })
export class Stock extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String, ref: Product.name })
  product: Product;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: true, type: Number })
  quantity: number;
}

export const StockSchema = SchemaFactory.createForClass(Stock);

// Compound index for stock queries by product and location
StockSchema.index({ product: 1, location: 1 });
StockSchema.index({ location: 1 });

purifySchema(StockSchema);
