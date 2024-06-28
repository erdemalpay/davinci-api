import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { MenuItem } from '../menu/item.schema';
import { User } from '../user/user.schema';

@Schema({ _id: false })
export class Order extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: true, type: Number, ref: MenuItem.name })
  item: number;

  @Prop({ required: true, type: Number, ref: 'Table' })
  table: number;

  @Prop({ required: true, type: Number })
  quantity: number;

  @Prop({ required: true, type: String })
  status: string;

  @Prop({ required: false, type: String })
  note: string;

  @Prop({ required: true, type: Number })
  unitPrice: number;

  @Prop({ required: true, type: Number })
  totalPrice: number;

  @Prop({ required: false, type: Number })
  discount: number;

  @Prop({ required: true, type: Date })
  createdAt: Date;

  @Prop({ required: true, type: String, ref: User.name })
  createdBy: string;

  @Prop({ required: false, type: Date })
  preparedAt: Date;

  @Prop({ required: false, type: String, ref: User.name })
  preparedBy: string;

  @Prop({ required: false, type: Date })
  deliveredAt: Date;

  @Prop({ required: false, type: String, ref: User.name })
  deliveredBy: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
purifySchema(OrderSchema);
