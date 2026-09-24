import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';
import { MatchStage } from '../tournament.round-plan';

@Schema({ _id: false })
export class TournamentMatchPlayer {
  @Prop({ required: true, type: Number })
  participantId: number;

  @Prop({ required: false, type: Number })
  score: number;

  @Prop({ required: false, type: Number })
  rank: number;

  @Prop({ required: false, type: Number })
  points: number;

  // Eşit skorda organizatörün üst tura çıkardığı oyuncu
  @Prop({ required: false, type: Boolean })
  wonTieBreak: boolean;
}

const TournamentMatchPlayerSchema = SchemaFactory.createForClass(
  TournamentMatchPlayer,
);

@Schema({ _id: false })
export class TournamentPendingTie {
  @Prop({ required: true, type: [Number] })
  participantIds: number[];

  @Prop({ required: true, type: Number })
  slots: number;
}

const TournamentPendingTieSchema =
  SchemaFactory.createForClass(TournamentPendingTie);

@Schema({ _id: false, timestamps: true })
export class TournamentMatch extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, index: true })
  tournamentId: number;

  @Prop({ required: true, type: String, enum: MatchStage })
  stage: MatchStage;

  @Prop({ required: true, type: Number })
  round: number;

  // Bay maçlarında 0
  @Prop({ required: true, type: Number })
  tableNo: number;

  @Prop({ required: true, type: Boolean, default: false })
  isBye: boolean;

  @Prop({ required: true, type: Boolean, default: false })
  isCompleted: boolean;

  @Prop({ required: true, type: [TournamentMatchPlayerSchema] })
  players: TournamentMatchPlayer[];

  // Eleme masasında çıkış sınırında eşitlik: organizatör kimin çıkacağını seçene kadar dolu
  @Prop({ required: false, type: TournamentPendingTieSchema, default: null })
  pendingTie: TournamentPendingTie | null;
}

export const TournamentMatchSchema =
  SchemaFactory.createForClass(TournamentMatch);
purifySchema(TournamentMatchSchema);
