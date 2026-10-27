import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { UpdateQuery } from 'mongoose';
import { Public } from '../auth/public.decorator';
import { LockInterceptor } from '../lock/lock.interceptor';
import { RaceConditionLockDecorator } from '../lock/race-condition-lock.decorator';
import { RedisKeys } from '../redis/redis.dto';
import { Tournament } from './schemas/tournament.schema';
import {
  AddParticipantDto,
  CheckInDto,
  CreateTournamentDto,
  MoveParticipantDto,
  PromoteRegistrationsDto,
  RegisterTournamentDto,
  ResolveTieDto,
  SetManualMainDto,
  SubmitScoresDto,
  UpdateConfirmationDto,
  UpdateParticipantDto,
} from './tournament.dto';
import { TournamentService } from './tournament.service';

@Controller('/tournaments')
export class TournamentController {
  constructor(private readonly tournamentService: TournamentService) {}

  // ─── Public (JWT gerektirmez) ─────────────────────────────────────────────

  @Public()
  @Get('/public')
  findOpenForRegistration() {
    return this.tournamentService.findOpenForRegistration();
  }

  @Public()
  @Get('/public/:slug')
  findPublic(@Param('slug') slug: string) {
    return this.tournamentService.findPublicBySlug(slug);
  }

  @Public()
  @Get('/public/:slug/live')
  findLive(@Param('slug') slug: string, @Query('round') round?: number) {
    return this.tournamentService.findLiveBySlug(slug, round);
  }

  @Public()
  @Post('/public/:slug/register')
  register(@Param('slug') slug: string, @Body() dto: RegisterTournamentDto) {
    return this.tournamentService.register(slug, dto);
  }

  @Public()
  @Get('/public/check-in/:code/qr')
  async getCheckInQr(@Param('code') code: string, @Res() res: Response) {
    const image = await this.tournamentService.getCheckInQr(code);
    return res.type('png').send(image);
  }

  // Kayıt mailindeki "Katılamayacağım" linki
  @Public()
  @Get('/public/registration/:code')
  findPublicRegistration(@Param('code') code: string) {
    return this.tournamentService.findPublicRegistration(code);
  }

  @Public()
  @Post('/public/registration/:code/decline')
  declineRegistration(@Param('code') code: string) {
    return this.tournamentService.declineByCode(code);
  }

  // ─── Turnuva ─────────────────────────────────────────────────────────────

  @Get()
  findAll() {
    return this.tournamentService.findAll();
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

  @Patch('/:id/registrations/:registrationId/main')
  setManualMain(
    @Param('id') id: number,
    @Param('registrationId') registrationId: number,
    @Body() dto: SetManualMainDto,
  ) {
    return this.tournamentService.setManualMain(id, registrationId, dto);
  }

  // Mailler iki kez gitmesin; giriş (admit) ile aynı kilidi kullanır
  @Post('/:id/waitlist/publish')
  @UseInterceptors(LockInterceptor)
  @RaceConditionLockDecorator({
    key: (req) => `${RedisKeys.TournamentLock}:${req.params.id}`,
    ttlSeconds: 10,
  })
  publishWaitlist(@Param('id') id: number) {
    return this.tournamentService.publishWaitlist(id);
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

  @Post('/:id/check-in')
  checkIn(@Param('id') id: number, @Body() dto: CheckInDto) {
    return this.tournamentService.checkIn(id, dto);
  }

  // Aynı anda iki görevli son boş yeri vermesin
  @Post('/:id/registrations/:registrationId/admit')
  @UseInterceptors(LockInterceptor)
  @RaceConditionLockDecorator({
    key: (req) => `${RedisKeys.TournamentLock}:${req.params.id}`,
    ttlSeconds: 10,
  })
  admitRegistration(
    @Param('id') id: number,
    @Param('registrationId') registrationId: number,
  ) {
    return this.tournamentService.admitRegistration(id, registrationId);
  }

  @Patch('/participants/:participantId')
  updateParticipant(
    @Param('participantId') participantId: number,
    @Body() dto: UpdateParticipantDto,
  ) {
    return this.tournamentService.updateParticipant(participantId, dto);
  }

  @Patch('/participants/:participantId/seat')
  moveParticipant(
    @Param('participantId') participantId: number,
    @Body() dto: MoveParticipantDto,
  ) {
    return this.tournamentService.moveParticipant(participantId, dto);
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

  @Post('/:id/rounds/regenerate')
  @UseInterceptors(LockInterceptor)
  @RaceConditionLockDecorator({
    key: (req) => `${RedisKeys.TournamentLock}:${req.params.id}`,
    ttlSeconds: 10,
  })
  regenerateRound(@Param('id') id: number) {
    return this.tournamentService.regenerateRound(id);
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
  getStandings(@Param('id') id: number, @Query('round') round?: number) {
    return this.tournamentService.getStandings(id, round);
  }
}
