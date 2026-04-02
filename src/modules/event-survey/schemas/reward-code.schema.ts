import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

export enum RewardCodeStatus {
  ISSUED = 'issued',
  REDEEMED = 'redeemed',
  EXPIRED = 'expired',
}

export enum RedeemChannel {
  BARISTA = 'barista',
  GM = 'gm',
}

@Schema({ _id: false, timestamps: true })
export class RewardCode extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String, unique: true })
  code: string;

  @Prop({ required: true, type: Number, index: true })
  responseId: number;

  @Prop({ required: true, type: Number, index: true })
  eventId: number;

  @Prop({ required: true, type: Date })
  expiresAt: Date;

  @Prop({ required: true, type: String, enum: RewardCodeStatus, default: RewardCodeStatus.ISSUED })
  status: RewardCodeStatus;

  @Prop({ required: false, type: Date })
  redeemedAt: Date;

  @Prop({ required: false, type: String })
  redeemedByUserId: string;

  @Prop({ required: false, type: String, enum: RedeemChannel })
  redeemChannel: RedeemChannel;

  // Ödül bilgisinin snapshot'ı — event değişse bile kod zamanındaki ödül bilgisi korunur
  @Prop({ required: true, type: String })
  rewardLabel: string;
}

export const RewardCodeSchema = SchemaFactory.createForClass(RewardCode);
purifySchema(RewardCodeSchema);
