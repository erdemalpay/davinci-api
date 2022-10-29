import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { ShiftValues } from './shiftDataTypes';

@Schema({ _id: false })
export class ShiftSlot extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true })
  day: number;

  @Prop({ required: true })
  shift: ShiftValues;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: Location;

  @Prop({ required: true })
  requiredPerson: number;

  @Prop({ required: true, default: true })
  active: boolean;
}

export const ShiftSlotSchema = SchemaFactory.createForClass(ShiftSlot);

purifySchema(ShiftSlotSchema);
