import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

export class ConcurrentRequest {
  userId?: string;
  userName?: string;
  requestBody?: any;
}

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

  @Prop({
    required: true,
    type: [{ userId: String, userName: String, requestBody: Object, _id: false }],
  })
  requests: ConcurrentRequest[];
}

export const ConcurrencyLogSchema =
  SchemaFactory.createForClass(ConcurrencyLog);
ConcurrencyLogSchema.index({ createdAt: -1 });
purifySchema(ConcurrencyLogSchema);
