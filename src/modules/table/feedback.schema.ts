import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../location/location.schema';
import { Table } from './table.schema';

@Schema({ _id: false, timestamps: true })
export class Feedback extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;

  @Prop({ required: false, type: Number, ref: Table.name })
  table: number;

  @Prop({ required: true, type: String })
  tableName: string;

  @Prop({ required: false, type: Number })
  starRating: number;

  @Prop({ required: false, type: String })
  comment: string;
}

export const FeedbackSchema = SchemaFactory.createForClass(Feedback);
purifySchema(FeedbackSchema);
