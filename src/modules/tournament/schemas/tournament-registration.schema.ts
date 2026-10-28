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

// Yedek listesinde kişiye en son bildirilen yer (asil, Yedek N ya da listeden çıktı)
export enum ListStatus {
  MAIN = 'main',
  WAITLIST = 'waitlist',
  WITHDRAWN = 'withdrawn',
}

// Katılmayacak bilgisinin nereden geldiği
export enum DeclineSource {
  LINK = 'link',
  PANEL = 'panel',
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

  // Turnuva günü girişte okutulan QR'ın içeriği; bu özellikten önceki başvurularda boş
  @Prop({ required: false, type: String })
  checkInCode: string;

  // Turnuvadaki kayıt sırası (1'den başlar); bu özellikten önceki başvurularda boş
  @Prop({ required: false, type: Number })
  sequence?: number;

  @Prop({ required: true, type: Boolean, default: false })
  isPaid: boolean;

  // QR okutulup kafeye geldiği an; katılımcı olmasa da yazılır
  @Prop({ required: false, type: Date })
  arrivedAt?: Date;

  // Yedek listesi ilk kez güncellenene kadar boş; durum kayıt sırasından hesaplanır
  @Prop({ required: false, type: String, enum: ListStatus })
  listStatus?: ListStatus;

  @Prop({ required: false, type: Number })
  waitlist?: number;

  @Prop({ required: false, type: String, enum: DeclineSource })
  declineSource?: DeclineSource;

  // Panelden "Asil yap" denildi; liste güncellenince asil olur
  @Prop({ required: false, type: Boolean })
  isManualMain?: boolean;

  // Yeri başkasına verildikten sonra iptali geri alındı; listenin sonuna eklenir
  @Prop({ required: false, type: Date })
  requeuedAt?: Date;
}

export const TournamentRegistrationSchema = SchemaFactory.createForClass(
  TournamentRegistration,
);
TournamentRegistrationSchema.index(
  { tournamentId: 1, phone: 1 },
  { unique: true },
);
TournamentRegistrationSchema.index(
  { checkInCode: 1 },
  { unique: true, sparse: true },
);
purifySchema(TournamentRegistrationSchema);
