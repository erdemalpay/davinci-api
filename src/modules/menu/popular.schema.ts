import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { MenuItem } from './item.schema';

@Schema({ _id: false })
export class Popular extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number })
  order: number;

  @Prop({ required: true, type: Number, ref: MenuItem.name })
  item: MenuItem;
}

export const PopularSchema = SchemaFactory.createForClass(Popular);

purifySchema(PopularSchema);
