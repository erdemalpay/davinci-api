import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';
import { PaymentMethod } from './../accounting/paymentMethod.schema';

@Schema({ _id: false })
export class Collection extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: true, type: Date })
  createdAt: Date;

  @Prop({ required: true, type: String, ref: User.name })
  createdBy: string;

  @Prop({ required: true, type: Number })
  amount: number;

  @Prop({ required: true, type: Boolean })
  isCancelled: boolean;

  @Prop({ required: true, type: String, ref: PaymentMethod.name })
  paymentMethod: string;
}

export const CollectionSchema = SchemaFactory.createForClass(Collection);
purifySchema(CollectionSchema);
