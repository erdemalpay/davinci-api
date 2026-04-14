import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false, timestamps: true })
export class ConcurrencyLog extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, index: true })
  method: string;

  @Prop({ required: true, type: String, index: true })
  endpoint: string;

  @Prop({ required: true, type: Number })
  inFlightCount: number;

  @Prop({ required: false, type: String })
  userId?: string;

  @Prop({ required: false, type: String })
  userName?: string;
}

export const ConcurrencyLogSchema =
  SchemaFactory.createForClass(ConcurrencyLog);
purifySchema(ConcurrencyLogSchema);
