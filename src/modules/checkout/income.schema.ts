import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';

@Schema({ _id: false })
export class Income extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  date: string;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: true, type: Number })
  amount: number;

  @Prop({ required: true, type: String })
  note: string;
}

export const IncomeSchema = SchemaFactory.createForClass(Income);

purifySchema(IncomeSchema);
