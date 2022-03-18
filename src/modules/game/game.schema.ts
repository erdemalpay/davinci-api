import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from '../../lib/purifySchema';
@Schema()
export class Game extends Document {
  @Prop({ required: true })
  _id: number;

  @Prop({ required: true, index: true })
  name: string;

  @Prop()
  image: string;

  @Prop()
  thumbnail: string;

  @Prop({ required: true, default: false })
  expansion: boolean;
}

export const GameSchema = SchemaFactory.createForClass(Game);

purifySchema(GameSchema);
