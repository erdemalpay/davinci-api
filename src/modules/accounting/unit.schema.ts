import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false })
export class Unit extends Document {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true, type: String })
  name: string;
}

export const UnitSchema = SchemaFactory.createForClass(Unit);

purifySchema(UnitSchema);
