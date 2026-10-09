import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as moment from 'moment-timezone';
import { Model, UpdateQuery } from 'mongoose';
import { isMongoDuplicateKey } from 'src/utils/mongoErrors';
import { generateUniqueSlug } from 'src/utils/uniqueSlug';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { TournamentMailService } from './tournament-mail.service';
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
  findTieAfter,
  pointsForRank,
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
  'placementPointsBySize',
  'byePoints',
  'advanceCount',
  'advancePerTable',
  'thirdPlaceMatch',
];

// Girilmemiş (undefined/null) değer de geçersiz sayılır
const isAtLeast = (value: number | undefined | null, min: number) =>
  typeof value === 'number' && value >= min;

// Masadaki oyuncu sayısına göre sıra puanları; eksik masanın ayrı puanı olabilir
const placementPointsFor = (tournament: Tournament, tableSize: number) =>
  tournament.placementPointsBySize?.[tableSize] ?? tournament.placementPoints;

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
    private readonly tournamentMailService: TournamentMailService,
  ) {}

  // ─── Turnuva ─────────────────────────────────────────────────────────────────

  findAll() {
    return this.tournamentModel
      .find({ isDeleted: { $ne: true } })
      .sort({ date: -1 })
      .exec();
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

  // Menüdeki "Turnuvalar" butonu: sadece kaydı açık olanlar, en yakın tarihli önce
  async findOpenForRegistration() {
    const tournaments = await this.tournamentModel
      .find({
        isDeleted: { $ne: true },
        status: TournamentStatus.NOT_STARTED,
        isRegistrationOpen: true,
      })
      .sort({ date: 1 })
      .exec();
    return tournaments
      .filter((tournament) => this.isRegistrationOpen(tournament))
      .map(({ _id, name, date, slug }) => ({ _id, name, date, slug }));
  }

  async findPublicBySlug(slug: string) {
    const tournament = await this.findTournament({ slug });
    return {
      _id: tournament._id,
      name: tournament.name,
      date: tournament.date,
      startTime: tournament.startTime,
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
      // Beklenmez: mail gecikse ya da gitmese de başvuru yanıtı etkilenmez
      void this.tournamentMailService.sendRegistrationMail(
        tournament,
        registration,
      );
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

    // Açık maçı varsa o gelir (isCompleted: false önce sıralanır); hiç maçı yoksa null
    const match = await this.matchModel
      .findOne(
        {
          tournamentId: participant.tournamentId,
          'players.participantId': participantId,
        },
        { isCompleted: 1 },
        { sort: { isCompleted: 1 } },
      )
      .exec();
    if (match && !match.isCompleted)
      throw new BadRequestException(
        'Katılımcı skoru girilmemiş bir maçta, önce maçı tamamlayın',
      );

    const result = match
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
        'Berabere kalan masada karar verilmeden sonraki tur oluşturulamaz',
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
      ...(next.thirdPlace
        ? [
            {
              tournamentId,
              stage,
              round,
              tableNo: next.tables.length + 1,
              isBye: false,
              isCompleted: false,
              isThirdPlace: true,
              players: next.thirdPlace.map((participantId) => ({
                participantId,
              })),
            },
          ]
        : []),
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

    const byId = (a: number, b: number) => a - b;
    const seated = match.players.map((p) => p.participantId).sort(byId);
    const scored = dto.scores.map((s) => s.participantId).sort(byId);
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
      isElimination ? this.isFinalRound(match) : false,
    ]);
    if (hasLaterRound)
      throw new BadRequestException(
        'Sonraki tur oluşturulduğu için bu maçın skoru değiştirilemez',
      );

    const players = rankTable(
      dto.scores,
      placementPointsFor(tournament, dto.scores.length),
    );
    // Elemede masadan çıkanlar (finalde şampiyon, 3.'lük masasında 3.) eşit skorla
    // belirsiz kalırsa, puan turlarında her eşitlikte karar beklenir
    const cut = isFinal ? 1 : tournament.advancePerTable;
    const pendingTie = isElimination
      ? findCutTie(players, cut)
      : findTieAfter(players, 0);
    const updated = await this.matchModel
      .findByIdAndUpdate(
        matchId,
        { players, isCompleted: true, pendingTie },
        { new: true },
      )
      .exec();

    const isLastMatch = isElimination
      ? isFinal && !pendingTie && (await this.isFinalRoundDone(match))
      : await this.isLastMatchOfTournament(tournament, match);
    if (isLastMatch) await this.finishTournament(match.tournamentId);

    this.websocketGateway.emitTournamentChanged();
    return updated;
  }

  async resolveTie(matchId: number, dto: ResolveTieDto) {
    const match = await this.findMatch(matchId);
    const tie = match.pendingTie;
    if (!tie)
      throw new BadRequestException('Bu masada karar bekleyen beraberlik yok');

    const winnerIds = [...new Set(dto.winnerIds)];
    // Puan turlarında beraberlik olduğu gibi bırakılabilir (kimse seçilmez)
    const isLeague = match.stage === MatchStage.LEAGUE;
    const keepsTie = isLeague && winnerIds.length === 0;
    if (
      !keepsTie &&
      (winnerIds.length !== tie.slots ||
        winnerIds.some((id) => !tie.participantIds.includes(id)))
    )
      throw new BadRequestException(
        `Berabere kalanlardan ${tie.slots} kişi seçilmeli`,
      );
    const hasCustomPoints = dto.points !== undefined && dto.points !== null;
    if (hasCustomPoints && !keepsTie)
      throw new BadRequestException(
        'Elle puan sadece puan turlarında beraberlik bırakılırken verilebilir',
      );

    const current = match.players.map((p) => ({
      participantId: p.participantId,
      score: p.score,
      rank: p.rank,
      points: p.points,
    }));
    const ranked = keepsTie ? current : applyTieBreak(current, tie, winnerIds);
    // Puan turlarında puan yeni sıraya göre verilir; sıradaki eşitlik (varsa) ayrıca sorulur
    const tournament = isLeague
      ? await this.findTournament(match.tournamentId)
      : null;
    const tiedRank = current.find(
      (p) => p.participantId === tie.participantIds[0],
    )?.rank;
    const players = tournament
      ? ranked.map((p) => ({
          ...p,
          points:
            hasCustomPoints && tie.participantIds.includes(p.participantId)
              ? dto.points
              : pointsForRank(
                  placementPointsFor(tournament, ranked.length),
                  p.rank,
                ),
        }))
      : ranked;
    const pendingTie = tournament ? findTieAfter(players, tiedRank ?? 0) : null;
    // Birbirinden bağımsız okumalar tek seferde
    const [updated, lastMatchCheck] = await Promise.all([
      this.matchModel
        .findByIdAndUpdate(matchId, { players, pendingTie }, { new: true })
        .exec(),
      tournament
        ? this.isLastMatchOfTournament(tournament, match)
        : this.isFinalRound(match),
    ]);
    // Elemede final turundaysa turnuva bitmiş olabilir
    const isLastMatch = tournament
      ? !pendingTie && lastMatchCheck
      : lastMatchCheck && (await this.isFinalRoundDone(match));
    if (isLastMatch) await this.finishTournament(match.tournamentId);

    this.websocketGateway.emitTournamentChanged();
    return updated;
  }

  // Lig puan tablosu + eleme sonucu: turnuvanın genel sıralaması
  async getStandings(tournamentId: number) {
    const [tournament, participants, matches] = await Promise.all([
      this.findTournament(tournamentId),
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
      {
        shareTies: tournament.format === TournamentFormat.ELIMINATION,
        advancePerTable: tournament.advancePerTable,
      },
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
        // Panel tarihi "YYYY-MM-DD" gönderir (UTC gece yarısı saklanır); son gün dahil
        moment.tz('Europe/Istanbul').format('YYYY-MM-DD') <=
          moment.utc(tournament.registrationDeadline).format('YYYY-MM-DD'))
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

  // Tek masalı eleme turu finaldir (yanındaki 3.'lük masası sayılmaz)
  private async isFinalRound(match: TournamentMatch) {
    const tablesInRound = await this.matchModel
      .countDocuments({
        tournamentId: match.tournamentId,
        stage: MatchStage.ELIMINATION,
        round: match.round,
        isThirdPlace: { $ne: true },
      })
      .exec();
    return tablesInRound === 1;
  }

  // Final ve varsa 3.'lük masası skorlandı, bekleyen beraberlik kararı yok
  private async isFinalRoundDone(match: TournamentMatch) {
    const hasOpenTable = await this.matchModel
      .exists({
        tournamentId: match.tournamentId,
        stage: MatchStage.ELIMINATION,
        round: match.round,
        $or: [{ isCompleted: false }, { pendingTie: { $ne: null } }],
      })
      .exec();
    return !hasOpenTable;
  }

  // Sadece Swiss'te son turun son maçı (elemede final turu ayrıca denetlenir)
  private async isLastMatchOfTournament(
    tournament: Tournament,
    match: TournamentMatch,
  ) {
    if (
      tournament.format !== TournamentFormat.LEAGUE ||
      match.round !== tournament.leagueRounds
    )
      return false;
    const hasOpenMatch = await this.matchModel
      .exists({
        tournamentId: match.tournamentId,
        $or: [{ isCompleted: false }, { pendingTie: { $ne: null } }],
      })
      .exec();
    return !hasOpenMatch;
  }

  // Sadece seçilen formatta kullanılan ayarlar zorunlu
  private assertValidRules(
    rules: TournamentRules & {
      placementPoints?: number[];
      placementPointsBySize?: Record<number, number[]>;
      byePoints?: number;
    },
  ) {
    const hasLeague = rules.format !== TournamentFormat.ELIMINATION;
    const hasElimination = rules.format !== TournamentFormat.LEAGUE;
    if (hasLeague) {
      if (!isAtLeast(rules.leagueRounds, 1))
        throw new BadRequestException('Puan turlarında en az 1 tur olmalı');
      if (
        !isAtLeast(rules.minTableSize, 2) ||
        rules.minTableSize > rules.tableSize
      )
        throw new BadRequestException(
          'En küçük masa 2 ile masa başına oyuncu sayısı arasında olmalı',
        );
      if (!rules.placementPoints?.length)
        throw new BadRequestException('Sıraya göre puanlar girilmeli');
      const isInvalidPoints = (points: unknown) =>
        !Array.isArray(points) || points.some((p) => typeof p !== 'number');
      if (
        Object.values(rules.placementPointsBySize ?? {}).some(isInvalidPoints)
      )
        throw new BadRequestException(
          'Eksik masa puanları sayılardan oluşmalı',
        );
      if (rules.byePoints === undefined || rules.byePoints === null)
        throw new BadRequestException('Bay puanı girilmeli');
    }
    if (
      hasElimination &&
      !(
        isAtLeast(rules.advancePerTable, 1) &&
        rules.advancePerTable < eliminationTableSize(rules)
      )
    )
      throw new BadRequestException(
        'Masadan çıkacak kişi sayısı 1 ile eleme masası büyüklüğü arasında olmalı',
      );
    if (
      rules.format === TournamentFormat.LEAGUE_THEN_ELIMINATION &&
      !isAtLeast(rules.advanceCount, 2)
    )
      throw new BadRequestException('Elemeye en az 2 kişi çıkmalı');
    if (
      rules.thirdPlaceMatch &&
      !(hasElimination && eliminationTableSize(rules) === 2)
    )
      throw new BadRequestException(
        "3.'lük maçı sadece 2 kişilik masalarla oynanan elemede açılabilir",
      );
  }
}
