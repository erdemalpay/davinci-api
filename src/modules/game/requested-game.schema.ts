import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from '../../lib/purifySchema';

@Schema({ _id: false })
export class RequestedGameRequest {
  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, default: Date.now })
  requestedAt: Date;
}

export const RequestedGameRequestSchema =
  SchemaFactory.createForClass(RequestedGameRequest);

@Schema({ collection: 'requestedgames', timestamps: true })
export class RequestedGame extends Document {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    required: true,
    lowercase: true,
    trim: true,
    unique: true,
    index: true,
  })
  normalizedName: string;

  @Prop({ type: Number, required: false, index: true })
  bggGameId?: number;

  @Prop({ required: true, default: 0 })
  totalRequestCount: number;

  @Prop({ type: [RequestedGameRequestSchema], default: [] })
  requestList: RequestedGameRequest[];
}

export const RequestedGameSchema = SchemaFactory.createForClass(RequestedGame);

RequestedGameSchema.index(
  { normalizedName: 1, 'requestList.email': 1 },
  { unique: true },
);

purifySchema(RequestedGameSchema);
