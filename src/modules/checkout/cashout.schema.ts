import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';

@Schema({ _id: false })
export class Cashout extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  date: string;

  @Prop({ required: true, type: String })
  description: string;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: true, type: String, ref: Location.name })
  location: string;

  @Prop({ required: true, type: Number })
  amount: number;
}

export const CashoutSchema = SchemaFactory.createForClass(Cashout);

purifySchema(CashoutSchema);
