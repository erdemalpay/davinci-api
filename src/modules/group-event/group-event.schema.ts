import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

export enum GroupEventStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

export enum GroupEventType {
  CORPORATE = 'corporate',
  BIRTHDAY = 'birthday',
  SCHOOL_CLUB = 'school_club',
  TOURNAMENT = 'tournament',
  OTHER = 'other',
}

// A group's application to hold an event at the cafe (from davinciboardgame.com),
// approved or rejected from the panel.
@Schema({ _id: false, timestamps: true })
export class GroupEvent extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number })
  location: number;

  @Prop({ required: true, type: String })
  organization: string;

  @Prop({ required: true, type: String })
  contactName: string;

  @Prop({ required: true, type: String })
  phone: string;

  @Prop({ required: true, type: String })
  email: string;

  @Prop({ required: true, type: Number })
  participantCount: number;

  // YYYY-MM-DD, Istanbul calendar day
  @Prop({ required: true, type: String, index: true })
  date: string;

  // HH:mm; endTime may be 24:00
  @Prop({ required: true, type: String })
  startTime: string;

  @Prop({ required: true, type: String })
  endTime: string;

  @Prop({ required: true, type: String, enum: Object.values(GroupEventType) })
  eventType: GroupEventType;

  @Prop({ type: Boolean, default: false })
  wantsGameMaster: boolean;

  @Prop({ type: String })
  gamePreferences?: string;

  @Prop({ type: Boolean, default: false })
  wantsFood: boolean;

  @Prop({ type: String })
  foodRequest?: string;

  @Prop({ type: Number })
  budgetPerPerson?: number;

  @Prop({ type: Boolean, default: false })
  needsInvoice: boolean;

  @Prop({ type: String })
  invoiceTitle?: string;

  @Prop({ type: String })
  taxOffice?: string;

  @Prop({ type: String })
  taxNumber?: string;

  @Prop({ type: String })
  notes?: string;

  @Prop({
    type: String,
    enum: Object.values(GroupEventStatus),
    default: GroupEventStatus.PENDING,
    index: true,
  })
  status: GroupEventStatus;

  // Shown to the group in the approval / rejection email
  @Prop({ type: String })
  responseNote?: string;

  @Prop({ type: String })
  decidedBy?: string;

  @Prop({ type: Date })
  decidedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const GroupEventSchema = SchemaFactory.createForClass(GroupEvent);
GroupEventSchema.index({ date: 1, status: 1 });

purifySchema(GroupEventSchema);
