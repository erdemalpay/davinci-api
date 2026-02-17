import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

export enum WebhookSource {
  SHOPIFY = 'shopify',
  TRENDYOL = 'trendyol',
}

export enum WebhookStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  ERROR = 'error',
  FAILED = 'failed',
  ORDER_NOT_CREATED = 'order_not_created',
}

@Schema({ _id: false, timestamps: true })
export class WebhookLog extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, enum: WebhookSource, index: true })
  source: WebhookSource;

  @Prop({ required: true, type: String, index: true })
  endpoint: string;

  @Prop({ required: true, type: Object })
  requestBody: any;

  @Prop({ required: false, type: Object })
  responseBody?: any;

  @Prop({ required: true, enum: WebhookStatus, default: WebhookStatus.PENDING, index: true })
  status: WebhookStatus;

  @Prop({ required: false, type: Number })
  statusCode?: number;

  @Prop({ required: false, type: String })
  errorMessage?: string;

  @Prop({ required: false, type: [Number] })
  orderIds?: number[];

  @Prop({ required: false, type: String })
  externalOrderId?: string;

  @Prop({ required: false, type: Number })
  processingTimeMs?: number;

  @Prop({ required: false, type: Date })
  processedAt?: Date;
}

export const WebhookLogSchema = SchemaFactory.createForClass(WebhookLog);
purifySchema(WebhookLogSchema);
