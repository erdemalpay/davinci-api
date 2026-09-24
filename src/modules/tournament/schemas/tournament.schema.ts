import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { PairingMode, TournamentFormat } from '../tournament.round-plan';

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

  @Prop({ required: false, type: Number })
  minTableSize: number;

  @Prop({ required: true, type: Number, default: 0 })
  leagueRounds: number;

  // Masadaki sıraya göre puan: [1., 2., 3., ...]
  @Prop({ required: false, type: [Number], default: [] })
  placementPoints: number[];

  @Prop({ required: false, type: Number })
  byePoints: number;

  @Prop({ required: false, type: Number })
  advanceCount: number;

  @Prop({ required: false, type: Number })
  advancePerTable: number;

  @Prop({ required: false, type: Boolean, default: false })
  isDeleted: boolean;
}

export const TournamentSchema = SchemaFactory.createForClass(Tournament);
purifySchema(TournamentSchema);
