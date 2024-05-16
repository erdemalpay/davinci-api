import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { User } from '../user/user.schema';
import { PackageType } from './packageType.schema';
import { Product } from './product.schema';
import { StockLocation } from './stockLocation.schema';

@Schema({ _id: false })
export class ProductStockHistory extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, ref: Product.name })
  product: string;

  @Prop({ required: true, type: String, ref: StockLocation.name })
  location: string | number;

  @Prop({ required: false, type: String, ref: PackageType.name })
  packageType: PackageType;

  @Prop({ required: true, type: Number })
  quantity: number;

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
