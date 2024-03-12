import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class ExpenseType extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  name: string;
}

export const ExpenseTypeSchema = SchemaFactory.createForClass(ExpenseType);

purifySchema(ExpenseTypeSchema);
