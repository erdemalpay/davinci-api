import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Location } from '../../location/location.schema';
import { User } from '../../user/user.schema';
import { ApprovalStatus, ShiftChangeStatus, ShiftChangeType } from './shiftChangeRequest.enums';

class ShiftSnapshot {
  @Prop({ required: true, type: Number })
  shiftId: number; // Shift document'ın _id'si

  @Prop({ required: true, type: String })
  day: string; // Hangi gün (örn: "2025-11-10")

  @Prop({ required: true, type: String })
  startTime: string; // Vardiya başlangıç saati (örn: "09:00")

  @Prop({ required: false, type: String })
  endTime: string; // Vardiya bitiş saati (örn: "17:00")

  @Prop({ required: true, type: Number, ref: Location.name })
  location: number;
  @Prop({ required: false, type: String, ref: User.name })
  chefUser: string;

  @Prop({ required: true, type: String, ref: User.name })
  userId: string; // Bu shift'e atanmış kullanıcı
}

@Schema({ _id: false, timestamps: true })
export class ShiftChangeRequest extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, ref: User.name })
  requesterId: string;

  @Prop({ required: true, type: String, ref: User.name })
  targetUserId: string;

  @Prop({ required: true, type: ShiftSnapshot })
  requesterShift: ShiftSnapshot;

  @Prop({ required: true, type: ShiftSnapshot })
  targetShift: ShiftSnapshot;

  @Prop({
    required: true,
    type: String,
    enum: ShiftChangeType,
    default: ShiftChangeType.SWAP
  })
  type: string;

  @Prop({ required: true, type: String })
  requesterNote: string;

  @Prop({ required: false, type: String })
  managerNote?: string;

  @Prop({
    required: true,
    type: String,
    enum: ShiftChangeStatus,
    default: ShiftChangeStatus.PENDING
  })
  status: string;

  @Prop({
    required: true,
    type: String,
    enum: ApprovalStatus,
    default: ApprovalStatus.PENDING
  })
  managerApprovalStatus: string;

  @Prop({ required: false, type: Date })
  managerApprovedAt?: Date;

  @Prop({ required: false, type: String, ref: User.name })
  managerApprovedBy?: string;

  @Prop({
    required: true,
    type: String,
    enum: ApprovalStatus,
    default: ApprovalStatus.PENDING
  })
  targetUserApprovalStatus: string;

  @Prop({ required: false, type: Date })
  targetUserApprovedAt?: Date;

  @Prop({ required: false, type: String, ref: User.name })
  processedByManagerId: string;

  @Prop({ required: false, type: Date })
  processedAt: Date;
}

export const ShiftChangeRequestSchema = SchemaFactory.createForClass(ShiftChangeRequest);

ShiftChangeRequestSchema.index(
  { requesterId: 1, 'requesterShift.shiftId': 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: ShiftChangeStatus.PENDING }
  }
);

purifySchema(ShiftChangeRequestSchema);
