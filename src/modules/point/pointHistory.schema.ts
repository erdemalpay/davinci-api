import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Order } from '../order/order.schema';
import { Table } from '../table/table.schema';
import { User } from '../user/user.schema';
import { Point } from './point.schema';

@Schema({ _id: false })
export class PointHistory extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: Point.name })
  point: number;

  @Prop({ required: true, type: String, ref: User.name })
  pointUser: string;

  @Prop({ required: true, type: String, ref: User.name })
  createdBy: string;

  @Prop({ required: false, type: Number, ref: Order.name })
  orderId?: number;

  @Prop({ required: false, type: Number, ref: Table.name })
  tableId?: number;

  @Prop({ required: true, type: String })
  status: string;

  @Prop({ required: true, type: Number })
  currentAmount: number;

  @Prop({ required: true, type: Number })
  change: number;

  @Prop({ required: true, type: Date })
  createdAt: Date;
}

export const PointHistorySchema = SchemaFactory.createForClass(PointHistory);

purifySchema(PointHistorySchema);
