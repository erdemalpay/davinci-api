import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { PackageType } from './packageType.schema';
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

  @Prop({ required: false, type: String, ref: PackageType.name })
  packageType: PackageType;

  @Prop({ required: true, type: Number })
  quantity: number;
}

export const StockSchema = SchemaFactory.createForClass(Stock);

purifySchema(StockSchema);
