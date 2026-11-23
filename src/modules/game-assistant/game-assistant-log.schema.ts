import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

export const GAME_ASSISTANT_LOG_TTL_SECONDS = 30 * 24 * 60 * 60;

// Asistanın her cevabı. Kişisel veri tutulmaz: IP yok, clientId tarayıcıda üretilen
// anonim kimlik.
@Schema({ _id: false, timestamps: true })
export class GameAssistantLog extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, index: true })
  clientId: string;

  @Prop({ required: true, type: String })
  model: string;

  @Prop({ required: true, type: String })
  userMessage: string;

  @Prop({ required: false, type: String })
  replyText?: string;

  /** { name, input } listesi: talep raporu araç girdilerinden üretilir. */
  @Prop({ required: false, type: [MongooseSchema.Types.Mixed], default: [] })
  toolCalls: { name: string; input: unknown }[];

  @Prop({ required: false, type: [Number], default: [] })
  shownGameIds: number[];

  @Prop({ required: false, type: [String], default: [] })
  relaxed: string[];

  @Prop({ required: true, type: Boolean, default: false })
  fallbackToWizard: boolean;

  /** Konu dışı ya da hiç oyun gösterilemedi. */
  @Prop({ required: true, type: Boolean, default: false, index: true })
  unanswered: boolean;

  @Prop({ required: true, type: Number, default: 0 })
  inputTokens: number;

  @Prop({ required: true, type: Number, default: 0 })
  outputTokens: number;

  @Prop({ required: true, type: Number, default: 0 })
  costUsd: number;

  @Prop({ required: true, type: Number })
  durationMs: number;

  @Prop({ required: false, type: String })
  errorMessage?: string;
}

export const GameAssistantLogSchema =
  SchemaFactory.createForClass(GameAssistantLog);
GameAssistantLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: GAME_ASSISTANT_LOG_TTL_SECONDS },
);
purifySchema(GameAssistantLogSchema);
