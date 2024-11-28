import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';

@Schema({ _id: false })
export class CheckoutCash extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: false, type: String })
  description: string;

  @Prop({ required: true, type: Number })
  amount: number;

  @Prop({ required: true, type: String })
  date: string;

  @Prop({ required: true, type: String, ref: Location.name })
  location: any;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;
}

export const CheckoutCashSchema = SchemaFactory.createForClass(CheckoutCash);

purifySchema(CheckoutCashSchema);
