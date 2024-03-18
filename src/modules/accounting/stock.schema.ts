import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { Product } from './product.schema';
import { StockType } from './stockType.schema';
import { Unit } from './unit.schema';

@Schema({ _id: false })
export class Stock extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String, ref: Product.name })
  product: Product;

  @Prop({ type: String, ref: Unit.name })
  unit: Unit;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: Location;

  @Prop({ required: true, type: String, ref: StockType.name })
  stockType: StockType;

  @Prop({ required: true, type: Number })
  quantity: number;

  @Prop({ type: Number })
  unitPrice: number;
}

export const StockSchema = SchemaFactory.createForClass(Stock);

purifySchema(StockSchema);
