import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { Tiebreaker } from '../tournament.fixture';
import { PairingMode, TournamentFormat } from '../tournament.round-plan';

// sequence: son güncellemedeki son kayıt sırası, freeMain: kalan asil yeri,
// waitlistCount: o anki yedek sayısı
export interface WaitlistAnchor {
  sequence: number;
  freeMain: number;
  waitlistCount: number;
}

export enum TournamentStatus {
  NOT_STARTED = 'not_started',
  ONGOING = 'ongoing',
  FINISHED = 'finished',
}

@Schema({ _id: false, timestamps: true })
export class Tournament extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: false, type: Number })
  game: number;

  @Prop({ required: false, type: Number })
  location: number;

  @Prop({ required: true, type: Date })
  date: Date;

  // "HH:mm" (İstanbul saati). date yalnızca gün bilgisini taşır
  @Prop({ required: false, type: String })
  startTime?: string;

  @Prop({ required: true, type: String, unique: true })
  slug: string;

  @Prop({
    required: true,
    type: String,
    enum: TournamentStatus,
    default: TournamentStatus.NOT_STARTED,
  })
  status: TournamentStatus;

  @Prop({ required: true, type: Boolean, default: true })
  isRegistrationOpen: boolean;

  @Prop({ required: false, type: Date })
  registrationDeadline: Date;

  @Prop({ required: true, type: String, enum: TournamentFormat })
  format: TournamentFormat;

  @Prop({
    required: true,
    type: String,
    enum: PairingMode,
    default: PairingMode.SWISS,
  })
  pairingMode: PairingMode;

  @Prop({ required: true, type: Number })
  tableSize: number;

  // Eleme aşamasında farklı masa (ör. puan turları 4'lük, eleme 2'lik); boşsa tableSize
  @Prop({ required: false, type: Number })
  eliminationTableSize: number;

  // Final turunda yarı finalde elenenler de bir masada 3.'lük için oynar
  @Prop({ required: false, type: Boolean, default: false })
  thirdPlaceMatch: boolean;

  @Prop({ required: false, type: Number })
  minTableSize: number;

  @Prop({ required: true, type: Number, default: 0 })
  leagueRounds: number;

  // Masadaki sıraya göre puan: [1., 2., 3., ...]
  @Prop({ required: false, type: [Number], default: [] })
  placementPoints: number[];

  // Eksik kurulan masaların puanları, masa büyüklüğüne göre: { 3: [4, 1, 0] }
  @Prop({ required: false, type: Object })
  placementPointsBySize: Record<number, number[]>;

  @Prop({ required: false, type: Number })
  byePoints: number;

  @Prop({ required: false, type: Number })
  advanceCount: number;

  @Prop({ required: false, type: Number })
  advancePerTable: number;

  // Puanı eşit oyuncuların sırası (bkz. Tiebreaker); oyun skorunda skor scoreCap ile sınırlanır
  @Prop({
    required: true,
    type: String,
    enum: Tiebreaker,
    default: Tiebreaker.OPPONENTS,
  })
  tiebreaker: Tiebreaker;

  @Prop({ required: false, type: Number })
  scoreCap?: number;

  // Asil kontenjanı; boşsa sınırsız ve asil/yedek ayrımı yok
  @Prop({ required: false, type: Number })
  capacity?: number;

  // Asillerden sonra alınacak yedek sayısı; boşsa sınırsız
  @Prop({ required: false, type: Number })
  waitlistCapacity?: number;

  // Ücretliyse asil QR okutunca değil, ödeme alınınca katılımcı olur
  @Prop({ required: true, type: Boolean, default: false })
  hasEntryFee: boolean;

  // Kayıt formunun altında, kayıt olmadan önce gösterilen serbest metin
  @Prop({ required: false, type: String })
  participationNote?: string;

  // Yalnızca asillere (ve asile geçenlere), kayıt sonucunda ve mailde gösterilen serbest metin
  @Prop({ required: false, type: String })
  mainNote?: string;

  // Yalnızca yedeklere, kayıt sonucunda ve mailde gösterilen serbest metin
  @Prop({ required: false, type: String })
  waitlistNote?: string;

  // Başvuru sıra numaralarının sayacı; $inc ile atomik artırılır
  @Prop({ required: true, type: Number, default: 0 })
  registrationCount: number;

  // Yedek listesinin son güncellendiği an; sonra gelen başvurular listenin sonuna eklenir
  @Prop({ required: false, type: Object })
  waitlistAnchor?: WaitlistAnchor;

  // Tur süresi (dk); boşsa süre sınırı yok. Turnuva başladıktan sonra da değişebilir
  @Prop({ required: false, type: Number })
  roundDuration?: number;

  // O anki tura verilen ek süre (dk) ve sayacın elle bitirilmesi; her yeni turda sıfırlanır
  @Prop({ required: false, type: Number, default: 0 })
  roundExtraMinutes: number;

  @Prop({ required: false, type: Boolean, default: false })
  isRoundTimerStopped: boolean;

  // Sayaç duraklatıldıysa duraklatıldığı an; devam edilince duraklamada geçen süre
  // roundPausedSeconds'a eklenir ve sayaç kaldığı yerden sürer
  @Prop({ required: false, type: Date })
  roundPausedAt?: Date;

  @Prop({ required: false, type: Number, default: 0 })
  roundPausedSeconds: number;

  @Prop({ required: false, type: Boolean, default: false })
  isDeleted: boolean;
}

export const TournamentSchema = SchemaFactory.createForClass(Tournament);
purifySchema(TournamentSchema);
