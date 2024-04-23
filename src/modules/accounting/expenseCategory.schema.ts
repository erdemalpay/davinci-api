import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class ExpenseCategory extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;
}

export const ExpenseCategorySchema =
  SchemaFactory.createForClass(ExpenseCategory);

purifySchema(ExpenseCategorySchema);
