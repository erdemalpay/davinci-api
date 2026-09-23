import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { purifySchema } from 'src/lib/purifySchema';

@Schema({ _id: false, timestamps: true })
export class TournamentParticipant extends Document {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, type: Number, index: true })
  tournamentId: number;

  @Prop({ required: true, type: String })
  name: string;

  // Başvurudan alındıysa dolu; turnuva günü elle eklenende boş
  @Prop({ required: false, type: Number })
  registrationId: number;

  // Maç oynamış biri çıkarılırsa silinmez, pasife alınır (geçmiş maçlar bozulmasın)
  @Prop({ required: true, type: Boolean, default: true })
  isActive: boolean;
}

export const TournamentParticipantSchema = SchemaFactory.createForClass(
  TournamentParticipant,
);
purifySchema(TournamentParticipantSchema);
