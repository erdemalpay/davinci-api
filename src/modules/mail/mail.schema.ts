import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

export enum MailType {
  WELCOME = 'welcome',
  NEWSLETTER = 'newsletter',
  PROMOTIONAL = 'promotional',
  TRANSACTIONAL = 'transactional',
  ORDER_CONFIRMATION = 'order_confirmation',
  ORDER_UPDATE = 'order_update',
  PASSWORD_RESET = 'password_reset',
  ACCOUNT_VERIFICATION = 'account_verification',
  RESERVATION_CONFIRMATION = 'reservation_confirmation',
  GAME_NIGHT = 'game_night',
  SPECIAL_OFFER = 'special_offer',
  MEMBERSHIP_UPDATE = 'membership_update',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  UNSUBSCRIBED = 'unsubscribed',
  BOUNCED = 'bounced',
  COMPLAINED = 'complained',
}

@Schema({ timestamps: true })
export class MailSubscription extends Document {
  @Prop({ type: String, required: true, unique: true, lowercase: true })
  email: string;

  @Prop({ type: String })
  name: string;

  @Prop({
    type: [String],
    enum: Object.values(MailType),
    default: [MailType.NEWSLETTER, MailType.PROMOTIONAL],
  })
  subscribedTypes: MailType[];

  @Prop({
    type: String,
    enum: Object.values(SubscriptionStatus),
    default: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  @Prop({ type: String })
  userId: string;

  @Prop({ type: String })
  unsubscribeToken: string;

  @Prop({ type: Date })
  subscribedAt: Date;

  @Prop({ type: Date })
  unsubscribedAt: Date;

  @Prop({ type: Object })
  metadata: Record<string, any>;

  @Prop({ type: String })
  locale: string;
}

@Schema({ timestamps: true })
export class MailLog extends Document {
  @Prop({ type: String, required: true })
  email: string;

  @Prop({ type: String, required: true })
  subject: string;

  @Prop({ type: String, required: true, enum: Object.values(MailType) })
  mailType: MailType;

  @Prop({ type: String })
  messageId: string;

  @Prop({
    type: String,
    enum: ['sent', 'delivered', 'bounced', 'complained', 'failed'],
  })
  status: string;

  @Prop({ type: String })
  errorMessage: string;

  @Prop({ type: Object })
  metadata: Record<string, any>;

  @Prop({ type: Date })
  sentAt: Date;

  @Prop({ type: Date })
  deliveredAt: Date;

  @Prop({ type: Date })
  openedAt: Date;

  @Prop({ type: Date })
  clickedAt: Date;
}

@Schema({ timestamps: true })
export class MailTemplate extends Document {
  @Prop({ type: String, required: true, unique: true })
  name: string;

  @Prop({ type: String, required: true, enum: Object.values(MailType) })
  mailType: MailType;

  @Prop({ type: String, required: true })
  subject: string;

  @Prop({ type: String, required: true })
  htmlContent: string;

  @Prop({ type: String })
  textContent: string;

  @Prop({ type: [String], default: [] })
  requiredVariables: string[];

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: String })
  locale: string;

  @Prop({ type: Object })
  metadata: Record<string, any>;
}

export const MailSubscriptionSchema = purifySchema(
  SchemaFactory.createForClass(MailSubscription),
);

export const MailLogSchema = purifySchema(
  SchemaFactory.createForClass(MailLog),
);

export const MailTemplateSchema = purifySchema(
  SchemaFactory.createForClass(MailTemplate),
);
