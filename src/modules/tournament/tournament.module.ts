import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { LockModule } from '../lock/lock.module';
import { WebSocketModule } from '../websocket/websocket.module';
import {
  TournamentMatch,
  TournamentMatchSchema,
} from './schemas/tournament-match.schema';
import {
  TournamentParticipant,
  TournamentParticipantSchema,
} from './schemas/tournament-participant.schema';
import {
  TournamentRegistration,
  TournamentRegistrationSchema,
} from './schemas/tournament-registration.schema';
import { Tournament, TournamentSchema } from './schemas/tournament.schema';
import { TournamentController } from './tournament.controller';
import { TournamentService } from './tournament.service';

const mongooseModule = MongooseModule.forFeatureAsync([
  createAutoIncrementConfig(Tournament.name, TournamentSchema),
  createAutoIncrementConfig(
    TournamentRegistration.name,
    TournamentRegistrationSchema,
  ),
  createAutoIncrementConfig(
    TournamentParticipant.name,
    TournamentParticipantSchema,
  ),
  createAutoIncrementConfig(TournamentMatch.name, TournamentMatchSchema),
]);

@Module({
  imports: [mongooseModule, WebSocketModule, LockModule],
  controllers: [TournamentController],
  providers: [TournamentService],
})
export class TournamentModule {}
