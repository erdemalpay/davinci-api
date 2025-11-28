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
GameplaySchema.index({ mentor: 1 });
// Indexes for frequent queries
// For queryData() - location and date queries
GameplaySchema.index({ location: 1, date: 1 });
// For queryData() - game and location queries
GameplaySchema.index({ game: 1, location: 1 });
// For queryData() - date, location, and mentor compound queries
GameplaySchema.index({ date: 1, location: 1, mentor: 1 });
// For queryData() - createdBy queries
GameplaySchema.index({ createdBy: 1 });

purifySchema(GameplaySchema);
