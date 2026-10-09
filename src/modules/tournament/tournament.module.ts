import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createAutoIncrementConfig } from 'src/lib/autoIncrement';
import { GameModule } from '../game/game.module';
import { LocationModule } from '../location/location.module';
import { LockModule } from '../lock/lock.module';
import { MailModule } from '../mail/mail.module';
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
import { TournamentMailService } from './tournament-mail.service';
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
  imports: [
    mongooseModule,
    WebSocketModule,
    LockModule,
    MailModule,
    LocationModule,
    GameModule,
  ],
  controllers: [TournamentController],
  providers: [TournamentService, TournamentMailService],
})
export class TournamentModule {}
