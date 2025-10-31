import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';

export enum ReservationStatusEnum {
  WAITING = 'Waiting',
  COMING = 'Coming',
  NOT_COMING = 'Not coming',
  NOT_RESPONDED = 'Not responded',
  ALREADY_CAME = 'Already came',
  CANCELLED = 'Cancelled',
}

@Schema({ _id: false })
export class Reservation extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: Location;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ required: true, type: Number })
  order: number;

  @Prop()
  playerCount: number;

  @Prop({ default: '-' })
  reservedTable: string;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  reservationHour: string;

  @Prop()
  callHour: string;

  @Prop()
  approvedHour: string;

  @Prop({ default: 0 })
  callCount: number;

  @Prop({ default: ReservationStatusEnum.WAITING })
  status: ReservationStatusEnum;

  @Prop({ required: false, type: Date })
  comingExpiresAt: Date;

  @Prop({ required: false, type: String })
  note: string;
}

export const ReservationSchema = SchemaFactory.createForClass(Reservation);

purifySchema(ReservationSchema);
