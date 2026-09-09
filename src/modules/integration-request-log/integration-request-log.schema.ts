import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

export enum IntegrationSource {
  TRENDYOL = 'trendyol',
  SHOPIFY = 'shopify',
  HEPSIBURADA = 'hepsiburada',
}

export enum IntegrationRequestStatus {
  SUCCESS = 'success',
  ERROR = 'error',
}

export const INTEGRATION_REQUEST_LOG_TTL_SECONDS = 30 * 24 * 60 * 60;

@Schema({ _id: false, timestamps: true })
export class IntegrationRequestLog extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, enum: IntegrationSource })
  source: IntegrationSource;

  @Prop({ required: true, type: String })
  method: string;

  /** baseUrl cikarilmis yol, orn: /integration/product/sellers/924232/products */
  @Prop({ required: true, type: String })
  endpoint: string;

  /** GET'te query parametreleri, POST'ta govde. Maskelenmis kopya. */
  @Prop({ required: false, type: MongooseSchema.Types.Mixed })
  requestBody?: any;

  /** JSON olmayan cevaplarda (orn. HTML hata sayfasi) string olarak saklanir. */
  @Prop({ required: false, type: MongooseSchema.Types.Mixed })
  responseBody?: any;

  @Prop({ required: true, enum: IntegrationRequestStatus, index: true })
  status: IntegrationRequestStatus;

  /** Cevap alinamadiysa (baglanti hatasi) bos kalir. */
  @Prop({ required: false, type: Number })
  statusCode?: number;

  @Prop({ required: false, type: String })
  errorMessage?: string;

  @Prop({ required: true, type: Number })
  durationMs: number;
}

export const IntegrationRequestLogSchema = SchemaFactory.createForClass(
  IntegrationRequestLog,
);
// Tek alanli indeks cift yonlu calisir: bu indeks hem TTL'i hem
// sort({ createdAt: -1 }) sorgusunu karsilar.
IntegrationRequestLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: INTEGRATION_REQUEST_LOG_TTL_SECONDS },
);
purifySchema(IntegrationRequestLogSchema);
