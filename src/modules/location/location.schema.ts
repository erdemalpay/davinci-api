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

  @Prop({ required: false, index: true })
  activityNote: string;

  @Prop({ required: true, default: [1] })
  type: number[];

  @Prop({ required: false, index: true })
  tableCount: string;

  @Prop({ required: false, type: String })
  ikasId: string;

  @Prop({ type: [String], required: false })
  shifts?: string[];

  @Prop({ type: [String], required: false })
  tableNames?: string[];
}

export const LocationSchema = SchemaFactory.createForClass(Location);

purifySchema(LocationSchema);
