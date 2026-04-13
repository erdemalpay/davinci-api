import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

export enum PriceCompareLogType {
  CRON = 'cron',
  SITE = 'site',
}

export enum PriceCompareLogStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  PARTIAL_SUCCESS = 'partial_success',
  FAILED = 'failed',
}

@Schema({ _id: false, timestamps: true })
export class PriceCompareLog extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, enum: PriceCompareLogType, index: true })
  type: PriceCompareLogType;

  @Prop({ required: true, type: String, index: true })
  target: string;

  @Prop({
    required: true,
    enum: PriceCompareLogStatus,
    default: PriceCompareLogStatus.PENDING,
    index: true,
  })
  status: PriceCompareLogStatus;

  @Prop({ required: false, type: Object })
  metadata?: any;

  @Prop({ required: false, type: Object })
  responseBody?: any;

  @Prop({ required: false, type: String })
  errorMessage?: string;

  @Prop({ required: false, type: Number })
  totalItems?: number;

  @Prop({ required: false, type: Number })
  processingTimeMs?: number;

  @Prop({ required: false, type: Date })
  processedAt?: Date;
}

export const PriceCompareLogSchema =
  SchemaFactory.createForClass(PriceCompareLog);
purifySchema(PriceCompareLogSchema);
