import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { MenuCategory } from '../menu/category.schema';
import { MenuItem } from '../menu/item.schema';

@Schema({ _id: false })
export class OrderNotes extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  note: string;

  @Prop({ required: false, type: [{ type: Number, ref: MenuCategory.name }] })
  categories: number[];

  @Prop({ required: false, type: [{ type: Number, ref: MenuItem.name }] })
  items: number[];
}

export const OrderNotesSchema = SchemaFactory.createForClass(OrderNotes);
purifySchema(OrderNotesSchema);
