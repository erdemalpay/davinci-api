import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { User } from '../user/user.schema';
import { Order } from './order.schema';

@Schema({ _id: false })
export class OrderGroup extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: false, type: Number, ref: 'Table' })
  table: number;

  @Prop({ required: true, type: Date })
  createdAt: Date;

  @Prop({ required: true, type: String, ref: User.name })
  createdBy: string;

  @Prop({ required: true, type: [{ type: Number, ref: Order.name }] })
  orders: number[];

  @Prop({ required: false, type: Date })
  tableDate: Date;
}

export const OrderGroupSchema = SchemaFactory.createForClass(OrderGroup);
purifySchema(OrderGroupSchema);
