import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';

export class ShiftValues {
  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: true, type: String })
  shift: string;
}

@Schema({ _id: false })
export class Shift extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true })
  day: string;

  @Prop({ required: false, type: Number, ref: Location.name })
  location: number;

  @Prop([ShiftValues])
  shifts: ShiftValues[];
}

export const ShiftSchema = SchemaFactory.createForClass(Shift);

purifySchema(ShiftSchema);
