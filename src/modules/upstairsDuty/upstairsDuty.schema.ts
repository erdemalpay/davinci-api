import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';

// "Üstçü": a game master who stays upstairs while it is busy and gets the
// upstairs tables' calls first. Started and ended automatically.
@Schema({ _id: false, timestamps: true })
export class UpstairsDuty extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, ref: User.name })
  user: string;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  startHour: string;

  @Prop()
  finishHour?: string;
}

export const UpstairsDutySchema = SchemaFactory.createForClass(UpstairsDuty);

UpstairsDutySchema.index({ location: 1, date: 1 });
UpstairsDutySchema.index({ date: 1, finishHour: 1 });

purifySchema(UpstairsDutySchema);
