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
  SubmitScoresDto,
  UpdateConfirmationDto,
} from './tournament.dto';
import { computeStandings, rankTable } from './tournament.fixture';
import {
  FixtureError,
  FixtureErrorCode,
  MatchStage,
  planNextRound,
  TournamentFormat,
  TournamentRules,
} from './tournament.round-plan';

// Turnuva başladıktan sonra değiştirilemeyen alanlar (fikstürü bozar)
const RULE_FIELDS = [
  'format',
  'pairingMode',
  'tableSize',
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
    const tournament = await this.tournamentModel
      .findOne({ slug, isDeleted: { $ne: true } })
      .exec();
    if (!tournament) throw new NotFoundException('Turnuva bulunamadı');
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
    const tournament = await this.tournamentModel
      .findOne({ slug, isDeleted: { $ne: true } })
      .exec();
    if (!tournament) throw new NotFoundException('Turnuva bulunamadı');
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
    await this.assertNoOpenRound(tournamentId);
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
    await this.assertNoOpenRound(tournamentId);
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
      await this.tournamentModel
        .findByIdAndUpdate(tournamentId, { status: TournamentStatus.FINISHED })
        .exec();
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
    const match = await this.matchModel.findById(matchId).exec();
    if (!match) throw new NotFoundException('Maç bulunamadı');
    if (match.isBye) throw new BadRequestException('Bay maçına skor girilmez');

    const seated = match.players.map((p) => p.participantId).sort();
    const scored = dto.scores.map((s) => s.participantId).sort();
    if (seated.join() !== scored.join())
      throw new BadRequestException('Skorlar masadaki oyuncularla eşleşmiyor');

    // Sonraki tur bu maçın sonucuna göre kurulduysa skor artık değiştirilemez
    const hasLaterRound = await this.matchModel
      .exists({
        tournamentId: match.tournamentId,
        $or: [
          { stage: match.stage, round: { $gt: match.round } },
          ...(match.stage === MatchStage.LEAGUE
            ? [{ stage: MatchStage.ELIMINATION }]
            : []),
        ],
      })
      .exec();
    if (hasLaterRound)
      throw new BadRequestException(
        'Sonraki tur oluşturulduğu için bu maçın skoru değiştirilemez',
      );

    const tournament = await this.findTournament(match.tournamentId);
    const updated = await this.matchModel
      .findByIdAndUpdate(
        matchId,
        {
          players: rankTable(dto.scores, tournament.placementPoints),
          isCompleted: true,
        },
        { new: true },
      )
      .exec();

    // Tek masalı eleme turu finaldir; skoru girilince turnuva biter
    if (match.stage === MatchStage.ELIMINATION) {
      const tablesInRound = await this.matchModel
        .countDocuments({
          tournamentId: match.tournamentId,
          stage: MatchStage.ELIMINATION,
          round: match.round,
        })
        .exec();
      if (tablesInRound === 1)
        await this.tournamentModel
          .findByIdAndUpdate(match.tournamentId, {
            status: TournamentStatus.FINISHED,
          })
          .exec();
    }

    this.websocketGateway.emitTournamentChanged();
    return updated;
  }

  async getStandings(tournamentId: number) {
    const [participants, leagueMatches] = await Promise.all([
      this.participantModel.find({ tournamentId }).exec(),
      this.matchModel
        .find({ tournamentId, stage: MatchStage.LEAGUE, isCompleted: true })
        .exec(),
    ]);
    const names = new Map(participants.map((p) => [p._id, p.name]));
    return computeStandings(
      participants.map((p) => p._id),
      leagueMatches,
    ).map((row) => ({ ...row, name: names.get(row.participantId) }));
  }

  // ─── Yardımcılar ─────────────────────────────────────────────────────────────

  private async findTournament(id: number) {
    const tournament = await this.tournamentModel
      .findOne({ _id: id, isDeleted: { $ne: true } })
      .exec();
    if (!tournament) throw new NotFoundException('Turnuva bulunamadı');
    return tournament;
  }

  private isRegistrationOpen(tournament: Tournament) {
    return (
      tournament.status === TournamentStatus.NOT_STARTED &&
      tournament.isRegistrationOpen &&
      (!tournament.registrationDeadline ||
        new Date() < tournament.registrationDeadline)
    );
  }

  private async assertNoOpenRound(tournamentId: number) {
    const hasOpenMatch = await this.matchModel
      .exists({ tournamentId, isCompleted: false })
      .exec();
    if (hasOpenMatch)
      throw new BadRequestException(
        'Tur devam ediyor; katılımcı skorlar girildikten sonra eklenebilir',
      );
  }

  private assertValidRules(rules: TournamentRules) {
    if (rules.minTableSize > rules.tableSize)
      throw new BadRequestException(
        'En küçük masa, masa başına oyuncu sayısından büyük olamaz',
      );
    if (rules.advancePerTable >= rules.tableSize)
      throw new BadRequestException(
        'Masadan çıkacak kişi sayısı masa büyüklüğünden az olmalı',
      );
    if (
      rules.format === TournamentFormat.LEAGUE_THEN_ELIMINATION &&
      rules.leagueRounds < 1
    )
      throw new BadRequestException('Lig formatında en az 1 tur olmalı');
  }
}
