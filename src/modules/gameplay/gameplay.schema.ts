import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';

@Schema()
export class Gameplay extends Document {
  @Prop({ required: true, type: Number, ref: Location.name })
  location: Location;

  @Prop({ unique: true, required: true, index: true })
  playerCount: Number;

  @Prop({ required: true, type: Number, ref: Location.name })
  mentor: User;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  startHour: boolean;

  @Prop({ required: true })
  finishHour: boolean;
}

export const GameplaySchema = SchemaFactory.createForClass(Gameplay);

purifySchema(GameplaySchema);
