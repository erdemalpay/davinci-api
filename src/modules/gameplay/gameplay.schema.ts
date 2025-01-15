import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Game } from '../game/game.schema';
import { Location } from '../location/location.schema';
import { User } from '../user/user.schema';

@Schema({ _id: false })
export class Gameplay extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: Location;

  @Prop({ required: true })
  playerCount: number;

  @Prop({ required: true, type: String, ref: User.name })
  mentor: User;

  @Prop({ required: true, type: String, ref: User.name })
  createdBy: User;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  startHour: string;

  @Prop()
  finishHour: string;

  @Prop({ required: true, type: Number, ref: Game.name })
  game: Game;
}

export const GameplaySchema = SchemaFactory.createForClass(Gameplay);

purifySchema(GameplaySchema);
