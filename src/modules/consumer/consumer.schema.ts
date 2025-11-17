import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

export enum ConsumerStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Schema({ _id: false })
export class Consumer extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: true })
  surname: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  email: string;

  @Prop({ type: String, required: false })
  password: string;

  @Prop({ type: String })
  fullName: string;

  @Prop({
    type: String,
    enum: ConsumerStatus,
    default: ConsumerStatus.ACTIVE,
    required: true,
  })
  status: ConsumerStatus;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const ConsumerSchema = SchemaFactory.createForClass(Consumer);

purifySchema(ConsumerSchema, ['password']);
