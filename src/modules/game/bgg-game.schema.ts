import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from '../../lib/purifySchema';

@Schema({ _id: false, collection: 'bgggames' })
export class BggGame extends Document {
  @Prop({ type: Number, required: true })
  _id: number;

  @Prop({ required: true, index: true })
  name: string;
}

export const BggGameSchema = SchemaFactory.createForClass(BggGame);

purifySchema(BggGameSchema);
