import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from '../../lib/purifySchema';
@Schema({ _id: false })
export class Game extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, index: true })
  name: string;

  @Prop()
  image: string;

  @Prop()
  thumbnail: string;

  @Prop({ required: true, default: false })
  expansion: boolean;

  @Prop({ required: true, default: [] })
  locations: number[];

  @Prop({ required: false, type: Number })
  narrationDurationPoint: number;
}

export const GameSchema = SchemaFactory.createForClass(Game);

purifySchema(GameSchema);
