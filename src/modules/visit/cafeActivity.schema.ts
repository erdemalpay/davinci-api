import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';

@Schema({ _id: false })
export class CafeActivity extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: Location;

  @Prop({ required: true, type: String })
  hour: string;

  @Prop({ required: true, type: Number })
  personCount: number;

  @Prop({ required: true, type: Boolean, default: false })
  isCompleted: boolean;

  @Prop({ required: false, type: String })
  price: number;

  @Prop({ required: true, type: String })
  groupName: string;

  @Prop({ required: false, type: String })
  complimentary: string;
}

export const CafeActivitySchema = SchemaFactory.createForClass(CafeActivity);

purifySchema(CafeActivitySchema);
