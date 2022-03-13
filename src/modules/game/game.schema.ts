import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
@Schema()
export class Game extends Document {
  @Prop({ required: true })
  _id: number;

  @Prop({ required: true, index: true })
  title: string;

  @Prop({ required: true })
  image: string;

  @Prop({ required: true })
  thumbnail: string;

  @Prop({ required: true })
  expansion: boolean;
}

export const GameSchema = SchemaFactory.createForClass(Game);

purifySchema(GameSchema);
