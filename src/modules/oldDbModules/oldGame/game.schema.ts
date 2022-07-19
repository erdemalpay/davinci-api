import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
export class Game extends Document {
  @Prop({ required: true })
  _id: number;

  @Prop({ required: true, index: true })
  title: string;

  @Prop()
  image: string;

  @Prop()
  thumbnail: string;

  @Prop({ required: true, default: false })
  expansion: boolean;
}

export const OldGameSchema = SchemaFactory.createForClass(Game);
