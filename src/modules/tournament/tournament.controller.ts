import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { UpdateQuery } from 'mongoose';
import { Public } from '../auth/public.decorator';
import { LockInterceptor } from '../lock/lock.interceptor';
import { RaceConditionLockDecorator } from '../lock/race-condition-lock.decorator';
import { RedisKeys } from '../redis/redis.dto';
import { Tournament } from './schemas/tournament.schema';
import {
  AddParticipantDto,
  CreateTournamentDto,
  PromoteRegistrationsDto,
  RegisterTournamentDto,
  ResolveTieDto,
  SubmitScoresDto,
  UpdateConfirmationDto,
} from './tournament.dto';
import { TournamentService } from './tournament.service';

@Controller('/tournaments')
export class TournamentController {
  constructor(private readonly tournamentService: TournamentService) {}

  // ─── Public (JWT gerektirmez) ─────────────────────────────────────────────

  @Public()
  @Get('/public/:slug')
  findPublic(@Param('slug') slug: string) {
    return this.tournamentService.findPublicBySlug(slug);
  }

  @Public()
  @Post('/public/:slug/register')
  register(@Param('slug') slug: string, @Body() dto: RegisterTournamentDto) {
    return this.tournamentService.register(slug, dto);
  }

  // ─── Turnuva ─────────────────────────────────────────────────────────────

  @Get()
  findAll() {
    return this.tournamentService.findAll();
  }

  @Get('/:id')
  findById(@Param('id') id: number) {
    return this.tournamentService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateTournamentDto) {
    return this.tournamentService.create(dto);
  }

  @Patch('/:id')
  update(@Param('id') id: number, @Body() updates: UpdateQuery<Tournament>) {
    return this.tournamentService.update(id, updates);
  }

  @Delete('/:id')
  remove(@Param('id') id: number) {
    return this.tournamentService.remove(id);
  }

  // ─── Başvurular ──────────────────────────────────────────────────────────

  @Get('/:id/registrations')
  findRegistrations(@Param('id') id: number) {
    return this.tournamentService.findRegistrations(id);
  }

  @Patch('/registrations/:registrationId')
  updateConfirmation(
    @Param('registrationId') registrationId: number,
    @Body() dto: UpdateConfirmationDto,
  ) {
    return this.tournamentService.updateConfirmation(registrationId, dto);
  }

  @Post('/:id/registrations/promote')
  promoteRegistrations(
    @Param('id') id: number,
    @Body() dto: PromoteRegistrationsDto,
  ) {
    return this.tournamentService.promoteRegistrations(id, dto.registrationIds);
  }

  // ─── Katılımcılar ────────────────────────────────────────────────────────

  @Get('/:id/participants')
  findParticipants(@Param('id') id: number) {
    return this.tournamentService.findParticipants(id);
  }

  @Post('/:id/participants')
  addParticipant(@Param('id') id: number, @Body() dto: AddParticipantDto) {
    return this.tournamentService.addParticipant(id, dto);
  }

  @Delete('/participants/:participantId')
  removeParticipant(@Param('participantId') participantId: number) {
    return this.tournamentService.removeParticipant(participantId);
  }

  // ─── Fikstür ─────────────────────────────────────────────────────────────

  @Get('/:id/matches')
  findMatches(@Param('id') id: number) {
    return this.tournamentService.findMatches(id);
  }

  // Çift tıklamada aynı tur iki kez oluşmasın
  @Post('/:id/rounds')
  @UseInterceptors(LockInterceptor)
  @RaceConditionLockDecorator({
    key: (req) => `${RedisKeys.TournamentLock}:${req.params.id}`,
    ttlSeconds: 10,
  })
  generateNextRound(@Param('id') id: number) {
    return this.tournamentService.generateNextRound(id);
  }

  @Patch('/matches/:matchId/scores')
  submitScores(
    @Param('matchId') matchId: number,
    @Body() dto: SubmitScoresDto,
  ) {
    return this.tournamentService.submitScores(matchId, dto);
  }

  @Patch('/matches/:matchId/tiebreak')
  resolveTie(@Param('matchId') matchId: number, @Body() dto: ResolveTieDto) {
    return this.tournamentService.resolveTie(matchId, dto);
  }

  @Get('/:id/standings')
  getStandings(@Param('id') id: number) {
    return this.tournamentService.getStandings(id);
  }
}
