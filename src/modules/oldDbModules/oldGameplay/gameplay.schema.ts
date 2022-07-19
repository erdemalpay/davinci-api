import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Game } from '../oldGame/game.schema';
import { User } from '../oldUser/user.schema';

@Schema()
export class Gameplay extends Document {
  @Prop({ required: true })
  playerCount: number;

  @Prop({ required: true, type: Types.ObjectId, ref: User.name })
  mentor: User;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  startHour: string;

  @Prop()
  finishHour: string;

  @Prop({ required: true, type: Number, ref: Game.name })
  game: Game;
}

export const OldGameplaySchema = SchemaFactory.createForClass(Gameplay);
