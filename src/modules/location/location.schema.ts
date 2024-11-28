import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class Location extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, index: true })
  name: string;

  @Prop({ required: true, default: true })
  active: boolean;

  @Prop({ required: true, default: true })
  type: number[];
}

export const LocationSchema = SchemaFactory.createForClass(Location);

purifySchema(LocationSchema);
