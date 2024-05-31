import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { StockLocation } from '../accounting/stockLocation.schema';
import { User } from '../user/user.schema';

@Schema({ _id: false })
export class Expense extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  date: string;

  @Prop({ required: true, type: String })
  description: string;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: true, type: String, ref: StockLocation.name })
  location: string;

  @Prop({ required: true, type: Number })
  amount: number;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);

purifySchema(ExpenseSchema);
