import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Unit } from './unit.schema';

@Schema({ _id: false })
export class Product extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: Number, ref: Unit.name })
  unit: Unit;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

purifySchema(ProductSchema);
