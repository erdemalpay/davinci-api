import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Gameplay } from '../oldGameplay/gameplay.schema';

@Schema()
export class Table extends Document {
  @Prop({ type: [{ type: Number, ref: Gameplay.name }] })
  gameplays: Gameplay[];

  @Prop({ required: true })
  playerCount: number;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  startHour: string;

  @Prop()
  finishHour: string;
}

export const OldTableSchema = SchemaFactory.createForClass(Table);
