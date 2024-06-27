import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Gameplay } from '../gameplay/gameplay.schema';
import { Location } from '../location/location.schema';
// import { Order } from '../order/order.schema';

@Schema({ _id: false })
export class Table extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: Location;

  @Prop({ type: [{ type: Number, ref: Gameplay.name }] })
  gameplays: Gameplay[];

  @Prop({ required: true })
  playerCount: number;

  @Prop({ required: true })
  name: string;

  // @Prop({ required: false, type: [{ type: Number, ref: Order.name }] })
  // orders: number[];

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  startHour: string;

  @Prop()
  finishHour: string;
}

export const TableSchema = SchemaFactory.createForClass(Table);

purifySchema(TableSchema);
