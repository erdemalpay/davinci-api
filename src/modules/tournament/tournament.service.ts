import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { isMongoDuplicateKey } from 'src/utils/mongoErrors';
import { generateUniqueSlug } from 'src/utils/uniqueSlug';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { TournamentMatch } from './schemas/tournament-match.schema';
import { TournamentParticipant } from './schemas/tournament-participant.schema';
import {
  ConfirmationStatus,
  TournamentRegistration,
} from './schemas/tournament-registration.schema';
import { Tournament, TournamentStatus } from './schemas/tournament.schema';
import {
  AddParticipantDto,
  CreateTournamentDto,
  RegisterTournamentDto,
  ResolveTieDto,
  SubmitScoresDto,
  UpdateConfirmationDto,
} from './tournament.dto';
import {
  applyTieBreak,
  computeFinalRanking,
  computeStandings,
  findCutTie,
  rankTable,
  roundResults,
} from './tournament.fixture';
import {
  FixtureError,
  FixtureErrorCode,
  MatchStage,
  eliminationTableSize,
  planNextRound,
  TournamentFormat,
  TournamentRules,
} from './tournament.round-plan';

// Turnuva başladıktan sonra değiştirilemeyen alanlar (fikstürü bozar)
const RULE_FIELDS = [
  'format',
  'pairingMode',
  'tableSize',
  'eliminationTableSize',
  'minTableSize',
  'leagueRounds',
  'placementPoints',
  'byePoints',
  'advanceCount',
  'advancePerTable',
];

const FIXTURE_ERROR_MESSAGES: Record<FixtureErrorCode, string> = {
  INCOMPLETE_ROUND: 'Skoru girilmemiş maçlar var, önce onları tamamlayın',
  NOT_ENOUGH_PARTICIPANTS: 'Masa kurmaya yetecek katılımcı yok',
  NO_PROGRESS:
    'Masadan çıkacak kişi sayısı oyuncu sayısını azaltmıyor, ayarları kontrol edin',
};

@Injectable()
export class TournamentService {
  constructor(
    @InjectModel(Tournament.name)
    private readonly tournamentModel: Model<Tournament>,
    @InjectModel(TournamentRegistration.name)
    private readonly registrationModel: Model<TournamentRegistration>,
    @InjectModel(TournamentParticipant.name)
    private readonly participantModel: Model<TournamentParticipant>,
    @InjectModel(TournamentMatch.name)
    private readonly matchModel: Model<TournamentMatch>,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  // ─── Turnuva ─────────────────────────────────────────────────────────────────

  findAll() {
    return this.tournamentModel
      .find({ isDeleted: { $ne: true } })
      .sort({ date: -1 })
      .exec();
  }

  findById(id: number) {
    return this.findTournament(id);
  }

  async create(dto: CreateTournamentDto) {
    this.assertValidRules(dto as TournamentRules);
    const slug = await generateUniqueSlug(this.tournamentModel, dto.name);
    const tournament = await this.tournamentModel.create({ ...dto, slug });
    this.websocketGateway.emitTournamentChanged();
    return tournament;
  }

  async update(id: number, updates: UpdateQuery<Tournament>) {
    const tournament = await this.findTournament(id);
    const touchesRules = RULE_FIELDS.some((field) => field in updates);
    if (touchesRules && tournament.status !== TournamentStatus.NOT_STARTED)
      throw new BadRequestException(
        'Turnuva başladıktan sonra kurallar değiştirilemez',
      );
    if (touchesRules)
      this.assertValidRules({
        ...tournament.toObject(),
        ...updates,
      } as TournamentRules);

    const updated = await this.tournamentModel
      .findByIdAndUpdate(id, updates, { new: true })
      .exec();
    this.websocketGateway.emitTournamentChanged();
    return updated;
  }

  async remove(id: number) {
    const tournament = await this.tournamentModel
      .findByIdAndUpdate(id, { isDeleted: true }, { new: true })
      .exec();
    this.websocketGateway.emitTournamentChanged();
    return tournament;
  }

  // ─── Kayıt (Public) ──────────────────────────────────────────────────────────

  async findPublicBySlug(slug: string) {
    const tournament = await this.findTournament({ slug });
    return {
      _id: tournament._id,
      name: tournament.name,
      date: tournament.date,
      game: tournament.game,
      location: tournament.location,
      isRegistrationOpen: this.isRegistrationOpen(tournament),
    };
  }

  async register(slug: string, dto: RegisterTournamentDto) {
    const tournament = await this.findTournament({ slug });
    if (!this.isRegistrationOpen(tournament))
      throw new BadRequestException('Bu turnuvanın kayıtları kapandı');

    try {
      const registration = await this.registrationModel.create({
        ...dto,
        phone: dto.phone.replace(/\s/g, ''),
        email: dto.email.toLowerCase(),
        tournamentId: tournament._id,
      });
      this.websocketGateway.emitTournamentChanged();
      return { _id: registration._id };
    } catch (err) {
      if (isMongoDuplicateKey(err))
        throw new BadRequestException(
          'Bu telefon numarasıyla zaten başvuru yapılmış',
        );
      throw err;
    }
  }

  // ─── Başvurular ──────────────────────────────────────────────────────────────

  findRegistrations(tournamentId: number) {
    return this.registrationModel
      .find({ tournamentId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async updateConfirmation(registrationId: number, dto: UpdateConfirmationDto) {
    const registration = await this.registrationModel
      .findByIdAndUpdate(
        registrationId,
        {
          confirmationStatus: dto.confirmationStatus,
          confirmedAt:
            dto.confirmationStatus === ConfirmationStatus.CONFIRMED
              ? new Date()
              : null,
        },
        { new: true },
      )
      .exec();
    this.websocketGateway.emitTournamentChanged();
    return registration;
  }

  // ─── Katılımcılar ────────────────────────────────────────────────────────────

  findParticipants(tournamentId: number) {
    return this.participantModel.find({ tournamentId }).sort({ _id: 1 }).exec();
  }

  // Sadece gönderilen başvurular katılımcı olur; daha önce eklenen tekrar eklenmez.
  async promoteRegistrations(tournamentId: number, registrationIds: number[]) {
    await this.assertCanAddParticipants(tournamentId);
    const [registrations, existing] = await Promise.all([
      this.registrationModel
        .find({ tournamentId, _id: { $in: registrationIds } })
        .exec(),
      this.participantModel
        .find({ tournamentId, registrationId: { $in: registrationIds } })
        .exec(),
    ]);
    const existingIds = new Set(existing.map((p) => p.registrationId));
    const participants = await this.participantModel.create(
      registrations
        .filter((r) => !existingIds.has(r._id))
        .map((r) => ({
          tournamentId,
          name: r.fullName,
          registrationId: r._id,
        })),
    );
    this.websocketGateway.emitTournamentChanged();
    return participants;
  }

  async addParticipant(tournamentId: number, dto: AddParticipantDto) {
    await this.findTournament(tournamentId);
    await this.assertCanAddParticipants(tournamentId);
    const participant = await this.participantModel.create({
      tournamentId,
      name: dto.name,
    });
    this.websocketGateway.emitTournamentChanged();
    return participant;
  }

  // Maç oynamışsa pasife alınır (geçmiş maçlar ve puan tablosu bozulmasın).
  async removeParticipant(participantId: number) {
    const participant = await this.participantModel
      .findById(participantId)
      .exec();
    if (!participant) throw new NotFoundException('Katılımcı bulunamadı');

    const inOpenMatch = await this.matchModel
      .exists({
        tournamentId: participant.tournamentId,
        isCompleted: false,
        'players.participantId': participantId,
      })
      .exec();
    if (inOpenMatch)
      throw new BadRequestException(
        'Katılımcı skoru girilmemiş bir maçta, önce maçı tamamlayın',
      );

    const hasPlayed = await this.matchModel
      .exists({
        tournamentId: participant.tournamentId,
        'players.participantId': participantId,
      })
      .exec();
    const result = hasPlayed
      ? await this.participantModel
          .findByIdAndUpdate(participantId, { isActive: false }, { new: true })
          .exec()
      : await this.participantModel.findByIdAndDelete(participantId).exec();
    this.websocketGateway.emitTournamentChanged();
    return result;
  }

  // ─── Fikstür ─────────────────────────────────────────────────────────────────

  findMatches(tournamentId: number) {
    return this.matchModel
      .find({ tournamentId })
      .sort({ stage: -1, round: 1, tableNo: 1 })
      .exec();
  }

  async generateNextRound(tournamentId: number) {
    const tournament = await this.findTournament(tournamentId);
    if (tournament.status === TournamentStatus.FINISHED)
      throw new BadRequestException('Turnuva tamamlandı');

    const [participants, matches] = await Promise.all([
      this.participantModel.find({ tournamentId, isActive: true }).exec(),
      this.matchModel.find({ tournamentId }).exec(),
    ]);
    if (matches.some((m) => m.pendingTie))
      throw new BadRequestException(
        'Berabere kalan masada kimin çıkacağı seçilmeden sonraki tur oluşturulamaz',
      );

    let next: ReturnType<typeof planNextRound>;
    try {
      next = planNextRound(
        tournament,
        participants.map((p) => p._id),
        matches,
      );
    } catch (err) {
      if (err instanceof FixtureError)
        throw new BadRequestException(FIXTURE_ERROR_MESSAGES[err.code]);
      throw err;
    }

    if (!next) {
      await this.finishTournament(tournamentId);
      this.websocketGateway.emitTournamentChanged();
      return [];
    }

    const { stage, round } = next;
    const created = await this.matchModel.create([
      ...next.tables.map((table) => ({
        tournamentId,
        stage,
        round,
        tableNo: table.tableNo,
        isBye: false,
        isCompleted: false,
        players: table.participantIds.map((participantId) => ({
          participantId,
        })),
      })),
      ...next.byes.map((participantId) => ({
        tournamentId,
        stage,
        round,
        tableNo: 0,
        isBye: true,
        isCompleted: true,
        players: [{ participantId, points: tournament.byePoints }],
      })),
    ]);

    // İlk tur oluşunca kayıt kendiliğinden kapanır
    await this.tournamentModel
      .findByIdAndUpdate(tournamentId, {
        status: TournamentStatus.ONGOING,
        isRegistrationOpen: false,
      })
      .exec();
    this.websocketGateway.emitTournamentChanged();
    return created;
  }

  async submitScores(matchId: number, dto: SubmitScoresDto) {
    const match = await this.findMatch(matchId);
    if (match.isBye) throw new BadRequestException('Bay maçına skor girilmez');

    const seated = match.players.map((p) => p.participantId).sort();
    const scored = dto.scores.map((s) => s.participantId).sort();
    if (seated.join() !== scored.join())
      throw new BadRequestException('Skorlar masadaki oyuncularla eşleşmiyor');

    // Birbirinden bağımsız okumalar tek seferde (her biri uzak veritabanına ayrı gidiş)
    const isElimination = match.stage === MatchStage.ELIMINATION;
    const [hasLaterRound, tournament, isFinal] = await Promise.all([
      // Sonraki tur bu maçın sonucuna göre kurulduysa skor artık değiştirilemez
      this.matchModel
        .exists({
          tournamentId: match.tournamentId,
          $or: [
            { stage: match.stage, round: { $gt: match.round } },
            ...(match.stage === MatchStage.LEAGUE
              ? [{ stage: MatchStage.ELIMINATION }]
              : []),
          ],
        })
        .exec(),
      this.findTournament(match.tournamentId),
      isElimination ? this.isFinalTable(match) : false,
    ]);
    if (hasLaterRound)
      throw new BadRequestException(
        'Sonraki tur oluşturulduğu için bu maçın skoru değiştirilemez',
      );

    const players = rankTable(dto.scores, tournament.placementPoints);
    // Elemede masadan çıkanlar (finalde şampiyon) eşit skorla belirsiz kalırsa karar beklenir
    const pendingTie = isElimination
      ? findCutTie(players, isFinal ? 1 : tournament.advancePerTable)
      : null;
    const updated = await this.matchModel
      .findByIdAndUpdate(
        matchId,
        { players, isCompleted: true, pendingTie },
        { new: true },
      )
      .exec();

    const isLastMatch = isElimination
      ? isFinal
      : await this.isLastMatchOfTournament(tournament, match);
    if (isLastMatch && !pendingTie)
      await this.finishTournament(match.tournamentId);

    this.websocketGateway.emitTournamentChanged();
    return updated;
  }

  async resolveTie(matchId: number, dto: ResolveTieDto) {
    const match = await this.findMatch(matchId);
    const tie = match.pendingTie;
    if (!tie)
      throw new BadRequestException('Bu masada karar bekleyen beraberlik yok');

    const winnerIds = [...new Set(dto.winnerIds)];
    if (
      winnerIds.length !== tie.slots ||
      winnerIds.some((id) => !tie.participantIds.includes(id))
    )
      throw new BadRequestException(
        `Berabere kalanlardan ${tie.slots} kişi seçilmeli`,
      );

    const players = applyTieBreak(
      match.players.map((p) => ({
        participantId: p.participantId,
        score: p.score,
        rank: p.rank,
        points: p.points,
      })),
      tie,
      winnerIds,
    );
    // Beraberlik sadece eleme masasında olur; son maç olup olmadığı final masası olmasıdır
    const [updated, isFinal] = await Promise.all([
      this.matchModel
        .findByIdAndUpdate(
          matchId,
          { players, pendingTie: null },
          { new: true },
        )
        .exec(),
      this.isFinalTable(match),
    ]);
    if (isFinal) await this.finishTournament(match.tournamentId);

    this.websocketGateway.emitTournamentChanged();
    return updated;
  }

  // Lig puan tablosu + eleme sonucu: turnuvanın genel sıralaması
  async getStandings(tournamentId: number) {
    const [participants, matches] = await Promise.all([
      this.participantModel.find({ tournamentId }).exec(),
      this.matchModel.find({ tournamentId }).exec(),
    ]);
    const names = new Map(participants.map((p) => [p._id, p.name]));
    const leagueMatches = matches.filter(
      (m) => m.stage === MatchStage.LEAGUE && m.isCompleted,
    );
    const leagueStandings = computeStandings(
      participants.map((p) => p._id),
      leagueMatches,
    );
    const rounds = roundResults(leagueMatches);
    return computeFinalRanking(
      leagueStandings,
      matches.filter((m) => m.stage === MatchStage.ELIMINATION),
    ).map((row) => ({
      ...row,
      name: names.get(row.participantId),
      rounds: rounds.get(row.participantId) ?? [],
    }));
  }

  // ─── Yardımcılar ─────────────────────────────────────────────────────────────

  private async findTournament(filter: number | { slug: string }) {
    const tournament = await this.tournamentModel
      .findOne({
        ...(typeof filter === 'number' ? { _id: filter } : filter),
        isDeleted: { $ne: true },
      })
      .exec();
    if (!tournament) throw new NotFoundException('Turnuva bulunamadı');
    return tournament;
  }

  private async findMatch(matchId: number) {
    const match = await this.matchModel.findById(matchId).exec();
    if (!match) throw new NotFoundException('Maç bulunamadı');
    return match;
  }

  private isRegistrationOpen(tournament: Tournament) {
    return (
      tournament.status === TournamentStatus.NOT_STARTED &&
      tournament.isRegistrationOpen &&
      (!tournament.registrationDeadline ||
        new Date() < tournament.registrationDeadline)
    );
  }

  // Geç gelen puan turlarına tur aralarında katılabilir; elemede masalar bir önceki
  // turdan çıkanlarla kurulduğu için yeni oyuncunun yeri yoktur.
  private async assertCanAddParticipants(tournamentId: number) {
    const blocking = await this.matchModel
      .findOne({
        tournamentId,
        $or: [{ isCompleted: false }, { stage: MatchStage.ELIMINATION }],
      })
      .exec();
    if (blocking?.stage === MatchStage.ELIMINATION)
      throw new BadRequestException(
        'Eleme başladıktan sonra katılımcı eklenemez',
      );
    if (blocking)
      throw new BadRequestException(
        'Tur devam ediyor; katılımcı skorlar girildikten sonra eklenebilir',
      );
  }

  private finishTournament(tournamentId: number) {
    return this.tournamentModel
      .findByIdAndUpdate(tournamentId, { status: TournamentStatus.FINISHED })
      .exec();
  }

  // Tek masalı eleme turu finaldir
  private async isFinalTable(match: TournamentMatch) {
    const tablesInRound = await this.matchModel
      .countDocuments({
        tournamentId: match.tournamentId,
        stage: MatchStage.ELIMINATION,
        round: match.round,
      })
      .exec();
    return tablesInRound === 1;
  }

  // Final masası ya da sadece Swiss'te son turun son maçı
  private async isLastMatchOfTournament(
    tournament: Tournament,
    match: TournamentMatch,
  ) {
    if (match.stage === MatchStage.ELIMINATION) return this.isFinalTable(match);
    if (
      tournament.format !== TournamentFormat.LEAGUE ||
      match.round !== tournament.leagueRounds
    )
      return false;
    const hasOpenMatch = await this.matchModel
      .exists({ tournamentId: match.tournamentId, isCompleted: false })
      .exec();
    return !hasOpenMatch;
  }

  // Sadece seçilen formatta kullanılan ayarlar zorunlu
  private assertValidRules(
    rules: TournamentRules & { placementPoints?: number[]; byePoints?: number },
  ) {
    const hasLeague = rules.format !== TournamentFormat.ELIMINATION;
    const hasElimination = rules.format !== TournamentFormat.LEAGUE;
    if (hasLeague) {
      if (!(rules.leagueRounds >= 1))
        throw new BadRequestException('Puan turlarında en az 1 tur olmalı');
      if (!(rules.minTableSize >= 2) || rules.minTableSize > rules.tableSize)
        throw new BadRequestException(
          'En küçük masa 2 ile masa başına oyuncu sayısı arasında olmalı',
        );
      if (!rules.placementPoints?.length)
        throw new BadRequestException('Sıraya göre puanlar girilmeli');
      if (rules.byePoints === undefined || rules.byePoints === null)
        throw new BadRequestException('Bay puanı girilmeli');
    }
    if (
      hasElimination &&
      !(
        rules.advancePerTable >= 1 &&
        rules.advancePerTable < eliminationTableSize(rules)
      )
    )
      throw new BadRequestException(
        'Masadan çıkacak kişi sayısı 1 ile eleme masası büyüklüğü arasında olmalı',
      );
    if (
      rules.format === TournamentFormat.LEAGUE_THEN_ELIMINATION &&
      !(rules.advanceCount >= 2)
    )
      throw new BadRequestException('Elemeye en az 2 kişi çıkmalı');
  }
}
