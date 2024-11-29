import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';

@Schema({ _id: false })
export class CheckoutControl extends Document {
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
}

export const CheckoutControlSchema =
  SchemaFactory.createForClass(CheckoutControl);

purifySchema(CheckoutControlSchema);
