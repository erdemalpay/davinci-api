import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';

@Schema({ _id: false, timestamps: true })
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

  @Prop({ required: false, type: Number })
  baseQuantity: number;
}

export const CheckoutControlSchema =
  SchemaFactory.createForClass(CheckoutControl);

// Indexes for frequent queries
// For findQueryCheckoutControl() - date range queries with location
CheckoutControlSchema.index({ date: 1, location: 1 });
// For findQueryCheckoutControl() - user and date queries
CheckoutControlSchema.index({ user: 1, date: 1 });
// For date sorting (default sort: date: 1)
CheckoutControlSchema.index({ date: 1 });

purifySchema(CheckoutControlSchema);
