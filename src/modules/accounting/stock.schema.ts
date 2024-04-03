import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Product } from './product.schema';
import { StockLocation } from './stockLocation.schema';

@Schema({ _id: false })
export class Stock extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String, ref: Product.name })
  product: Product;

  @Prop({ required: true, type: String, ref: StockLocation.name })
  location: StockLocation;

  @Prop({ required: true, type: Number })
  quantity: number;

  @Prop({ type: Number })
  unitPrice: number;
}

export const StockSchema = SchemaFactory.createForClass(Stock);

purifySchema(StockSchema);
