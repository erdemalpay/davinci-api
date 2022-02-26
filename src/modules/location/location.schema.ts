import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
@Schema()
export class Location extends Document {
  @Prop({ required: true, index: true })
  name: string;

  @Prop({ required: true, default: true })
  active: boolean;
}

export const LocationSchema = SchemaFactory.createForClass(Location);

purifySchema(LocationSchema);
