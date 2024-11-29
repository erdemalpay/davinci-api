import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { MenuCategory } from './category.schema';

export class CategoryGroup {
  @Prop({ required: true, type: Number, ref: MenuCategory.name })
  category: number;

  @Prop({ required: true, type: Number })
  percentage: number;
}

@Schema({ _id: false })
export class UpperCategory extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  name: string;

  @Prop([CategoryGroup])
  categoryGroup: CategoryGroup[];
}

export const UpperCategorySchema = SchemaFactory.createForClass(UpperCategory);

purifySchema(UpperCategorySchema);
