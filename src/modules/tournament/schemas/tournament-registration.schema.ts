import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

export enum RegistrationSource {
  QR = 'qr',
  SOCIAL = 'social',
  OTHER = 'other',
}

export enum ConfirmationStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  DECLINED = 'declined',
  UNREACHABLE = 'unreachable',
}

@Schema({ _id: false, timestamps: true })
export class TournamentRegistration extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, index: true })
  tournamentId: number;

  @Prop({ required: true, type: String })
  fullName: string;

  @Prop({ required: true, type: String })
  phone: string;

  @Prop({ required: true, type: String })
  email: string;

  @Prop({
    required: true,
    type: String,
    enum: RegistrationSource,
    default: RegistrationSource.OTHER,
  })
  source: RegistrationSource;

  @Prop({
    required: true,
    type: String,
    enum: ConfirmationStatus,
    default: ConfirmationStatus.PENDING,
  })
  confirmationStatus: ConfirmationStatus;

  @Prop({ required: false, type: Date })
  confirmedAt: Date;
}

export const TournamentRegistrationSchema = SchemaFactory.createForClass(
  TournamentRegistration,
);
TournamentRegistrationSchema.index(
  { tournamentId: 1, phone: 1 },
  { unique: true },
);
purifySchema(TournamentRegistrationSchema);
