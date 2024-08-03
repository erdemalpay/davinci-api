import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Kitchen } from './kitchen.schema';

@Schema({ _id: false })
export class MenuCategory extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, type: Number })
  order: number;

  @Prop({ required: true, default: [] })
  locations: number[];

  @Prop({ required: true, type: Number, ref: Kitchen.name })
  kitchen: number;

  @Prop({ required: true, type: Boolean, default: false })
  isAutoServed: boolean;

  @Prop({ type: String })
  imageUrl: string;
}

export const MenuCategorySchema = SchemaFactory.createForClass(MenuCategory);

purifySchema(MenuCategorySchema);
