import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { Product } from './product.schema';
import { StockType } from './stockType.schema';
import { Unit } from './unit.schema';

@Schema({ _id: false })
export class Stock extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: Product.name })
  product: Product;

  @Prop({ required: false, type: Number, ref: Unit.name })
  unit: Unit;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: Location;

  @Prop({ required: false, type: Number, ref: StockType.name })
  stockType: StockType;

  @Prop({ required: true, type: Number })
  quantity: number;
}

export const StockSchema = SchemaFactory.createForClass(Stock);

purifySchema(StockSchema);
