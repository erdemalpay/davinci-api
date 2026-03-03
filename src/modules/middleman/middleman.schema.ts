import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';

@Schema({ _id: false, timestamps: true })
export class Middleman extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, ref: User.name })
  user: User;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: Location;

  @Prop({ required: true })
  date: string;

  @Prop()
  startHour: string;

  @Prop()
  finishHour: string;
}

export const MiddlemanSchema = SchemaFactory.createForClass(Middleman);

MiddlemanSchema.index({ date: 1, user: 1, startHour: 1 });
MiddlemanSchema.index({ user: 1, date: 1 });
MiddlemanSchema.index({ location: 1, date: 1 });
MiddlemanSchema.index({ date: 1 });

purifySchema(MiddlemanSchema);
