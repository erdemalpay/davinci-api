import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class MenuCategory extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  name: string;
  
  @Prop({ required: true, type: Number })
  order: number;
}

export const MenuCategorySchema = SchemaFactory.createForClass(MenuCategory);

purifySchema(MenuCategorySchema);
