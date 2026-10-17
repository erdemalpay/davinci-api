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

  // Set on an automatic stand-in: the middleman who went to a game master
  // call because only they knew the game, the call and the game. The
  // middleman takes the role back once the call and the explanation are
  // over.
  @Prop({ type: String, ref: User.name })
  coveringFor?: string;

  @Prop({ type: Number })
  coveringCall?: number;

  @Prop({ type: Number })
  coveringGame?: number;
}

export const MiddlemanSchema = SchemaFactory.createForClass(Middleman);

MiddlemanSchema.index({ date: 1, user: 1, startHour: 1 });
MiddlemanSchema.index({ user: 1, date: 1 });
MiddlemanSchema.index({ location: 1, date: 1 });
MiddlemanSchema.index({ date: 1 });

purifySchema(MiddlemanSchema);
