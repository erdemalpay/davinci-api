import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { User } from '../user/user.schema';
import { Location } from '../location/Location.schema';
import { ShiftRequestTypeValues, ShiftValues } from './shiftDataTypes';

@Schema({ _id: false })
export class ShiftRequest extends Document {
  @Prop({ required: true, type: Number, ref: User.name })
  user: User;

  @Prop({ required: true })
  day: number;

  @Prop({ required: true })
  shift: ShiftValues;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: Location;

  @Prop({ required: true })
  type: ShiftRequestTypeValues;
}

export const ShiftRequestSchema = SchemaFactory.createForClass(ShiftRequest);

purifySchema(ShiftRequestSchema);
