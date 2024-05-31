import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { User } from '../user/user.schema';
import { StockLocation } from './../accounting/stockLocation.schema';

@Schema({ _id: false })
export class Income extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  date: string;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: true, type: String, ref: StockLocation.name })
  location: string;

  @Prop({ required: true, type: Number })
  amount: number;
}

export const IncomeSchema = SchemaFactory.createForClass(Income);

purifySchema(IncomeSchema);
