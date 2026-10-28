import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import * as moment from 'moment-timezone';
import { Model, UpdateQuery } from 'mongoose';
import * as QRCode from 'qrcode';
import { isMongoDuplicateKey } from 'src/utils/mongoErrors';
import { generateUniqueSlug } from 'src/utils/uniqueSlug';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  RegistrationMailKind,
  TournamentMailService,
} from './tournament-mail.service';
import { TournamentMatch } from './schemas/tournament-match.schema';
import { TournamentParticipant } from './schemas/tournament-participant.schema';
import {
  ConfirmationStatus,
  DeclineSource,
  ListStatus,
  TournamentRegistration,
} from './schemas/tournament-registration.schema';
import { Tournament, TournamentStatus } from './schemas/tournament.schema';
import {
  AddParticipantDto,
  CheckInDto,
  CreateTournamentDto,
  MoveParticipantDto,
  RegisterTournamentDto,
  ResolveTieDto,
  SetManualMainDto,
  SubmitScoresDto,
  UpdateConfirmationDto,
  UpdateParticipantDto,
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
  standingOptions,
  TournamentFormat,
  TournamentRules,
} from './tournament.round-plan';
import {
  isOverLimit,
  isSamePosition,
  ListPosition,
  nextPositions,
  positionFromSequence,
  publishedPosition,
  registrationNote,
  statusLabel,
} from './tournament.waitlist';

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
  'tiebreaker',
  'scoreCap',
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

    // Kontenjan değişse de bildirilen yerler eski kontenjana göre kalır; fark "Yedek Listesini
    // Güncelle" ile yayınlanır
    const freezesList =
      tournament.capacity &&
      'capacity' in updates &&
      updates.capacity !== tournament.capacity &&
      !tournament.waitlistAnchor;
    const updated = await this.tournamentModel
      .findByIdAndUpdate(
        id,
        freezesList
          ? {
              ...updates,
              waitlistAnchor: {
                sequence: 0,
                freeMain: tournament.capacity,
                waitlistCount: 0,
              },
            }
          : updates,
        { new: true },
      )
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
      participationNote: tournament.participationNote,
    };
  }

  // Oyuncuların telefondan takip ettiği sayfa; katılımcıların sadece adı gider
  async findLiveBySlug(slug: string, afterRound?: number) {
    const tournament = await this.findTournament({ slug });
    const [participants, matches] = await Promise.all([
      this.findParticipants(tournament._id),
      this.findMatches(tournament._id),
    ]);
    return {
      tournament,
      participants: participants.map(({ _id, name, isActive }) => ({
        _id,
        name,
        isActive,
      })),
      matches,
      standings: this.rankParticipants(
        tournament,
        participants,
        matches,
        afterRound,
      ),
    };
  }

  async register(slug: string, dto: RegisterTournamentDto) {
    const tournament = await this.findTournament({ slug });
    if (!this.isRegistrationOpen(tournament))
      throw new BadRequestException('Bu turnuvanın kayıtları kapandı');

    const registration = await this.createRegistration(tournament, dto);
    // Numara sayaçtan $inc ile alınır: aynı anda gelen iki kayıt aynı numarayı alamaz.
    // Kayıt önce eklendiği için reddedilen (aynı telefon) başvuru numara harcamaz.
    const { registrationCount: sequence } = await this.tournamentModel
      .findByIdAndUpdate(
        tournament._id,
        { $inc: { registrationCount: 1 } },
        { new: true },
      )
      .exec();
    if (isOverLimit(tournament, sequence)) {
      await this.registrationModel.findByIdAndDelete(registration._id).exec();
      throw new BadRequestException('Kayıtlar doldu');
    }
    await this.registrationModel
      .findByIdAndUpdate(registration._id, { sequence })
      .exec();
    registration.sequence = sequence;
    this.websocketGateway.emitTournamentChanged();
    // Beklenmez: mail gecikse ya da gitmese de başvuru yanıtı etkilenmez
    void this.tournamentMailService.sendRegistrationMail(
      tournament,
      registration,
    );
    const position = positionFromSequence(tournament, sequence);
    return {
      _id: registration._id,
      checkInCode: registration.checkInCode,
      registrationStatus: statusLabel(position),
      waitlistNumber: position?.waitlist,
      registrationNote: registrationNote(tournament, position),
    };
  }

  private async createRegistration(
    tournament: Tournament,
    dto: RegisterTournamentDto,
  ) {
    try {
      return await this.registrationModel.create({
        ...dto,
        phone: dto.phone.replace(/\s/g, ''),
        email: dto.email.toLowerCase(),
        tournamentId: tournament._id,
        checkInCode: randomBytes(8).toString('hex'),
      });
    } catch (err) {
      if (isMongoDuplicateKey(err))
        throw new BadRequestException(
          'Bu telefon numarasıyla zaten başvuru yapılmış',
        );
      throw err;
    }
  }

  // Kayıt mailindeki QR resmi; sadece gerçek bir başvurunun kodu için üretilir
  async getCheckInQr(code: string) {
    await this.findRegistrationByCode(code);
    return QRCode.toBuffer(code, { width: 400, margin: 2 });
  }

  // ─── Başvurular ──────────────────────────────────────────────────────────────

  // Her başvurunun kişiye bildirilen yeri ve "Yedek Listesini Güncelle"de alacağı yer
  async findRegistrations(tournamentId: number) {
    const [tournament, registrations] = await Promise.all([
      this.findTournament(tournamentId),
      this.registrationModel
        .find({ tournamentId })
        .sort({ createdAt: -1 })
        .exec(),
    ]);
    const next = nextPositions(tournament, registrations);
    return registrations.map((registration) => ({
      ...registration.toObject(),
      position: publishedPosition(tournament, registration),
      nextPosition: next.get(registration._id),
    }));
  }

  async updateConfirmation(registrationId: number, dto: UpdateConfirmationDto) {
    const registration = await this.registrationModel
      .findById(registrationId)
      .exec();
    if (!registration) throw new NotFoundException('Başvuru bulunamadı');
    const updated = await this.registrationModel
      .findByIdAndUpdate(
        registrationId,
        {
          confirmationStatus: dto.confirmationStatus,
          confirmedAt:
            dto.confirmationStatus === ConfirmationStatus.CONFIRMED
              ? new Date()
              : null,
          ...this.declineChanges(
            registration,
            dto.confirmationStatus,
            DeclineSource.PANEL,
          ),
        },
        { new: true },
      )
      .exec();
    this.websocketGateway.emitTournamentChanged();
    return updated;
  }

  // Katılmayacak işareti listeyi hemen değiştirmez, yer "Yedek Listesini Güncelle"de boşalır.
  // Yeri başkasına verildikten sonra geri alınırsa kişi listenin sonuna eklenir.
  private declineChanges(
    registration: TournamentRegistration,
    status: ConfirmationStatus,
    source: DeclineSource,
  ) {
    const isDeclined = status === ConfirmationStatus.DECLINED;
    if (
      isDeclined ===
      (registration.confirmationStatus === ConfirmationStatus.DECLINED)
    )
      return {};
    if (isDeclined) return { declineSource: source, isManualMain: false };
    return {
      declineSource: null,
      ...(registration.listStatus === ListStatus.WITHDRAWN && {
        requeuedAt: new Date(),
      }),
    };
  }

  // "Asil yap": yedek, liste güncellenince asil olur (kontenjan dolu olsa da)
  async setManualMain(
    tournamentId: number,
    registrationId: number,
    dto: SetManualMainDto,
  ) {
    const tournament = await this.findTournament(tournamentId);
    const registration = await this.registrationModel
      .findOne({ _id: registrationId, tournamentId })
      .exec();
    if (!registration) throw new NotFoundException('Başvuru bulunamadı');
    if (dto.isManualMain) {
      if (registration.confirmationStatus === ConfirmationStatus.DECLINED)
        throw new BadRequestException('Katılmayacak başvuru asil yapılamaz');
      if (
        publishedPosition(tournament, registration)?.listStatus !==
        ListStatus.WAITLIST
      )
        throw new BadRequestException('Sadece yedekler asil yapılabilir');
    }
    const updated = await this.registrationModel
      .findByIdAndUpdate(
        registrationId,
        { isManualMain: dto.isManualMain },
        { new: true },
      )
      .exec();
    this.websocketGateway.emitTournamentChanged();
    return updated;
  }

  // Bekleyen değişiklikleri bildirilen yer yapar; asile geçene ve yedek numarası değişene mail
  // gider. Sonra gelen başvurular güncel listenin sonuna eklenir (waitlistAnchor).
  async publishWaitlist(tournamentId: number) {
    const tournament = await this.findTournament(tournamentId);
    if (!tournament.capacity)
      throw new BadRequestException('Bu turnuvada kontenjan yok');
    const registrations = await this.registrationModel
      .find({ tournamentId, sequence: { $exists: true } })
      .exec();
    const next = nextPositions(tournament, registrations);
    const changes = registrations.flatMap((registration) => {
      const after = next.get(registration._id);
      return after
        ? [
            {
              registration,
              after,
              isChanged: !isSamePosition(
                publishedPosition(tournament, registration),
                after,
              ),
            },
          ]
        : [];
    });

    // Hepsi yazılır: liste sabitlenince eski başvuruların yeri artık kayıt sırasından hesaplanmaz
    await this.registrationModel.bulkWrite(
      changes.map(({ registration, after }) => ({
        updateOne: {
          filter: { _id: registration._id },
          update: {
            $set: {
              listStatus: after.listStatus,
              ...(after.waitlist && { waitlist: after.waitlist }),
            },
            $unset: {
              isManualMain: '',
              requeuedAt: '',
              ...(!after.waitlist && { waitlist: '' }),
            },
          },
        },
      })),
    );
    const count = (status: ListStatus) =>
      changes.filter(({ after }) => after.listStatus === status).length;
    const waitlistAnchor = {
      sequence: tournament.registrationCount,
      freeMain: Math.max(0, tournament.capacity - count(ListStatus.MAIN)),
      waitlistCount: count(ListStatus.WAITLIST),
    };
    const updated = await this.tournamentModel
      .findByIdAndUpdate(tournamentId, { waitlistAnchor }, { new: true })
      .exec();
    this.websocketGateway.emitTournamentChanged();

    const mails = changes.filter(
      ({ after, isChanged }) =>
        isChanged && after.listStatus !== ListStatus.WITHDRAWN,
    );
    // Beklenmez: mailler sırayla gider (SES hız sınırı), hatayı mail servisi loglar
    void this.sendListMails(updated, mails);
    const isPromoted = ({ after }: { after: ListPosition }) =>
      after.listStatus === ListStatus.MAIN;
    return {
      promoted: mails.filter(isPromoted).length,
      waitlistUpdated: mails.filter((mail) => !isPromoted(mail)).length,
    };
  }

  private async sendListMails(
    tournament: Tournament,
    mails: { registration: TournamentRegistration; after: ListPosition }[],
  ) {
    for (const { registration, after } of mails)
      await this.tournamentMailService.sendRegistrationMail(
        tournament,
        { ...registration.toObject(), ...after },
        after.listStatus === ListStatus.MAIN
          ? RegistrationMailKind.PROMOTED
          : RegistrationMailKind.WAITLIST_UPDATE,
      );
  }

  // Maildeki "Katılamayacağım" linkinin açtığı sayfa
  async findPublicRegistration(code: string) {
    const { tournament, registration } = await this.findByCode(code);
    return this.publicRegistration(tournament, registration);
  }

  async declineByCode(code: string) {
    const { tournament, registration } = await this.findByCode(code);
    const current = await this.publicRegistration(tournament, registration);
    if (current.isDeclined) return current;
    if (!current.canDecline)
      throw new BadRequestException('Bu kaydın iptal süresi doldu');
    const updated = await this.registrationModel
      .findByIdAndUpdate(
        registration._id,
        {
          confirmationStatus: ConfirmationStatus.DECLINED,
          confirmedAt: null,
          ...this.declineChanges(
            registration,
            ConfirmationStatus.DECLINED,
            DeclineSource.LINK,
          ),
        },
        { new: true },
      )
      .exec();
    this.websocketGateway.emitTournamentChanged();
    return this.publicRegistration(tournament, updated);
  }

  private async findByCode(code: string) {
    const registration = await this.findRegistrationByCode(code);
    const tournament = await this.findTournament(registration.tournamentId);
    return { tournament, registration };
  }

  // İptal sadece turnuva başlamadan ve kişi katılımcı olmadan yapılabilir
  private async publicRegistration(
    tournament: Tournament,
    registration: TournamentRegistration,
  ) {
    const isDeclined =
      registration.confirmationStatus === ConfirmationStatus.DECLINED;
    const isParticipant = await this.participantModel
      .exists({
        tournamentId: tournament._id,
        registrationId: registration._id,
      })
      .exec();
    return {
      tournamentName: tournament.name,
      date: tournament.date,
      startTime: tournament.startTime,
      fullName: registration.fullName,
      registrationStatus: statusLabel(
        publishedPosition(tournament, registration),
      ),
      isDeclined,
      canDecline:
        !isDeclined &&
        !isParticipant &&
        tournament.status === TournamentStatus.NOT_STARTED,
    };
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

  // Girişte okutulan QR: geliş saati yazılır. Ücretsiz turnuvada asil hemen katılımcı olur;
  // ücretli turnuvada asil ödemeyle, yedek boş yer kalırsa panelden (admitRegistration) alınır.
  async checkIn(tournamentId: number, dto: CheckInDto) {
    const tournament = await this.findTournament(tournamentId);
    const registration = await this.findRegistrationByCode(dto.code);
    if (registration.tournamentId !== tournamentId)
      throw new BadRequestException('Bu QR bu turnuvaya ait değil');
    await this.assertNotParticipant(registration);
    if (!registration.arrivedAt)
      await this.registrationModel
        .findByIdAndUpdate(registration._id, { arrivedAt: new Date() })
        .exec();
    this.websocketGateway.emitTournamentChanged();

    // Katılmayacağı yayınlanmış kişi de gelirse görevli Başvurular'dan karar verir
    const position = publishedPosition(tournament, registration);
    const isParticipant =
      !tournament.hasEntryFee &&
      (!position || position.listStatus === ListStatus.MAIN);
    if (isParticipant) await this.admit(tournament, registration);
    return {
      registrationId: registration._id,
      fullName: registration.fullName,
      listStatus: position?.listStatus,
      waitlistNumber: position?.waitlist,
      hasEntryFee: tournament.hasEntryFee,
      isParticipant,
    };
  }

  // QR sonucundaki "Ödendi" ve Başvurular'daki "Ücreti al, katılımcı yap"
  async admitRegistration(tournamentId: number, registrationId: number) {
    const tournament = await this.findTournament(tournamentId);
    const registration = await this.registrationModel
      .findOne({ _id: registrationId, tournamentId })
      .exec();
    if (!registration) throw new NotFoundException('Başvuru bulunamadı');
    await this.assertNotParticipant(registration);
    await this.admit(tournament, registration);
    return { fullName: registration.fullName };
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

  // Geri alınan oyuncu, sonradan eklenen gibi sonraki turdan itibaren eşleşir
  async updateParticipant(participantId: number, dto: UpdateParticipantDto) {
    const participant = await this.findParticipant(participantId);
    if (dto.isActive && !participant.isActive)
      await this.assertCanAddParticipants(participant.tournamentId);
    const updated = await this.participantModel
      .findByIdAndUpdate(participantId, dto, { new: true })
      .exec();
    this.websocketGateway.emitTournamentChanged();
    return updated;
  }

  // Maç oynamışsa pasife alınır (geçmiş maçlar ve puan tablosu bozulmasın);
  // skoru girilmemiş bir masada oturuyorsa oradan da kalkar.
  async removeParticipant(participantId: number) {
    const participant = await this.findParticipant(participantId);
    const [openMatch, hasPlayed] = await Promise.all([
      this.findOpenMatch(participant),
      this.matchModel
        .exists({
          tournamentId: participant.tournamentId,
          isCompleted: true,
          'players.participantId': participantId,
        })
        .exec(),
    ]);
    if (openMatch)
      await this.saveSeats(
        openMatch,
        this.seatsWithout(openMatch, participantId),
      );

    const result = hasPlayed
      ? await this.participantModel
          .findByIdAndUpdate(participantId, { isActive: false }, { new: true })
          .exec()
      : await this.participantModel.findByIdAndDelete(participantId).exec();
    this.websocketGateway.emitTournamentChanged();
    return result;
  }

  // Aynı turun skoru girilmemiş iki masası arasında yer değiştirme ya da taşıma
  async moveParticipant(participantId: number, dto: MoveParticipantDto) {
    const participant = await this.findParticipant(participantId);
    const [source, target, tournament] = await Promise.all([
      this.findOpenMatch(participant),
      this.findMatch(dto.matchId),
      this.findTournament(participant.tournamentId),
    ]);
    if (
      !source ||
      target.isCompleted ||
      target._id === source._id ||
      target.tournamentId !== source.tournamentId ||
      target.stage !== source.stage ||
      target.round !== source.round
    )
      throw new BadRequestException(
        'Sadece aynı turun skoru girilmemiş masaları arasında yer değiştirilebilir',
      );

    if (dto.swapWithId !== undefined) {
      if (!target.players.some((p) => p.participantId === dto.swapWithId))
        throw new BadRequestException(
          'Yer değiştirilecek oyuncu bu masada değil',
        );
      const swap = (match: TournamentMatch, from: number, to: number) =>
        match.players.map(({ participantId }) => ({
          participantId: participantId === from ? to : participantId,
        }));
      await Promise.all([
        this.saveSeats(source, swap(source, participantId, dto.swapWithId)),
        this.saveSeats(target, swap(target, dto.swapWithId, participantId)),
      ]);
    } else {
      const capacity =
        target.stage === MatchStage.ELIMINATION
          ? eliminationTableSize(tournament)
          : tournament.tableSize;
      if (target.players.length >= capacity)
        throw new BadRequestException(
          'Masa dolu; masadaki bir oyuncuyla yer değiştirin',
        );
      await Promise.all([
        this.saveSeats(source, this.seatsWithout(source, participantId)),
        this.saveSeats(target, [...target.players, { participantId }]),
      ]);
    }
    this.websocketGateway.emitTournamentChanged();
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

    // İlk tur oluşunca kayıt kendiliğinden kapanır; tur sayacı yeni tur için sıfırlanır
    await this.tournamentModel
      .findByIdAndUpdate(tournamentId, {
        status: TournamentStatus.ONGOING,
        isRegistrationOpen: false,
        roundExtraMinutes: 0,
        isRoundTimerStopped: false,
        roundPausedAt: null,
        roundPausedSeconds: 0,
      })
      .exec();
    this.websocketGateway.emitTournamentChanged();
    return created;
  }

  // Hiç skor girilmemiş son tur silinip kalan aktif oyuncularla yeniden kurulur
  async regenerateRound(tournamentId: number) {
    const matches = await this.matchModel.find({ tournamentId }).exec();
    const stage = matches.some((m) => m.stage === MatchStage.ELIMINATION)
      ? MatchStage.ELIMINATION
      : MatchStage.LEAGUE;
    const round = Math.max(
      0,
      ...matches.filter((m) => m.stage === stage).map((m) => m.round),
    );
    const latest = matches.filter(
      (m) => m.stage === stage && m.round === round,
    );
    if (!latest.length)
      throw new BadRequestException('Yeniden eşleştirilecek tur yok');
    if (latest.some((m) => m.isCompleted && !m.isBye))
      throw new BadRequestException('Skor girilmiş tur yeniden eşleştirilemez');

    await this.matchModel
      .deleteMany({ _id: { $in: latest.map((m) => m._id) } })
      .exec();
    return this.generateNextRound(tournamentId);
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

    const placementPoints = placementPointsFor(tournament, dto.scores.length);
    const players = rankTable(dto.scores, placementPoints);
    // Elemede masadan çıkanlar (finalde şampiyon, 3.'lük masasında 3.) eşit skorla
    // belirsiz kalırsa, puan turlarında da eşitlik puanı değiştiriyorsa karar beklenir
    const cut = isFinal ? 1 : tournament.advancePerTable;
    const pendingTie = isElimination
      ? findCutTie(players, cut)
      : findTieAfter(players, 0, placementPoints);
    const updated = await this.matchModel
      .findByIdAndUpdate(
        matchId,
        { players, isCompleted: true, pendingTie },
        { new: true },
      )
      .exec();

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
    const pendingTie = tournament
      ? findTieAfter(
          players,
          tiedRank ?? 0,
          placementPointsFor(tournament, ranked.length),
        )
      : null;
    const updated = await this.matchModel
      .findByIdAndUpdate(matchId, { players, pendingTie }, { new: true })
      .exec();

    this.websocketGateway.emitTournamentChanged();
    return updated;
  }

  // Lig puan tablosu + eleme sonucu: turnuvanın genel sıralaması
  async getStandings(tournamentId: number, afterRound?: number) {
    const [tournament, participants, matches] = await Promise.all([
      this.findTournament(tournamentId),
      this.participantModel.find({ tournamentId }).exec(),
      this.matchModel.find({ tournamentId }).exec(),
    ]);
    return this.rankParticipants(tournament, participants, matches, afterRound);
  }

  // Takip sayfası zaten çektiği katılımcı ve maçlarla hesaplatır; tekrar sorgu atılmaz.
  // afterRound verilirse tablo o puan turunun sonundaki haliyle döner: sonraki turlar ve eleme sayılmaz.
  private rankParticipants(
    tournament: Tournament,
    participants: TournamentParticipant[],
    matches: TournamentMatch[],
    afterRound?: number,
  ) {
    const names = new Map(participants.map((p) => [p._id, p.name]));
    const leagueMatches = matches.filter(
      (m) =>
        m.stage === MatchStage.LEAGUE &&
        m.isCompleted &&
        (!afterRound || m.round <= afterRound),
    );
    const leagueStandings = computeStandings(
      participants.map((p) => p._id),
      leagueMatches,
      standingOptions(tournament),
    );
    const rounds = roundResults(leagueMatches, standingOptions(tournament));
    return computeFinalRanking(
      leagueStandings,
      afterRound
        ? []
        : matches.filter((m) => m.stage === MatchStage.ELIMINATION),
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

  private async findRegistrationByCode(checkInCode: string) {
    const registration = await this.registrationModel
      .findOne({ checkInCode })
      .exec();
    if (!registration) throw new NotFoundException('QR bulunamadı');
    return registration;
  }

  private async assertNotParticipant(registration: TournamentRegistration) {
    const existing = await this.participantModel
      .exists({
        tournamentId: registration.tournamentId,
        registrationId: registration._id,
      })
      .exec();
    if (existing)
      throw new BadRequestException(`${registration.fullName} zaten katılımcı`);
  }

  // Kontenjan aktif katılımcılarla dolduysa kimse eklenmez; elle "Katılımcı Ekle" bu kontrole girmez
  private async admit(
    tournament: Tournament,
    registration: TournamentRegistration,
  ) {
    if (tournament.capacity) {
      const count = await this.participantModel
        .countDocuments({ tournamentId: tournament._id, isActive: true })
        .exec();
      if (count >= tournament.capacity)
        throw new BadRequestException('Kontenjan dolu');
    }
    if (tournament.hasEntryFee)
      await this.registrationModel
        .findByIdAndUpdate(registration._id, { isPaid: true })
        .exec();
    await this.promoteRegistrations(tournament._id, [registration._id]);
  }

  private async findParticipant(participantId: number) {
    const participant = await this.participantModel
      .findById(participantId)
      .exec();
    if (!participant) throw new NotFoundException('Katılımcı bulunamadı');
    return participant;
  }

  // Oyuncunun oturduğu skoru girilmemiş masa (varsa)
  private findOpenMatch(participant: TournamentParticipant) {
    return this.matchModel
      .findOne({
        tournamentId: participant.tournamentId,
        isCompleted: false,
        'players.participantId': participant._id,
      })
      .exec();
  }

  // Masadan kalkan oyuncudan sonra masada tek kişi kalmamalı; boşalan masa silinir
  private seatsWithout(match: TournamentMatch, participantId: number) {
    const players = match.players.filter(
      (p) => p.participantId !== participantId,
    );
    if (players.length === 1)
      throw new BadRequestException(
        'Masada tek kişi kalıyor; önce masaya başka bir oyuncu taşıyın',
      );
    return players;
  }

  // Skoru girilmemiş masada oyuncuların sadece kimliği vardır
  private saveSeats(
    match: TournamentMatch,
    players: { participantId: number }[],
  ) {
    return players.length
      ? this.matchModel.findByIdAndUpdate(match._id, { players }).exec()
      : this.matchModel.findByIdAndDelete(match._id).exec();
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

  // Geç gelen puan turlarına her an eklenebilir ve sonraki turdan itibaren eşleşir; elemede
  // masalar bir önceki turdan çıkanlarla kurulduğu için yeni oyuncunun yeri yoktur.
  private async assertCanAddParticipants(tournamentId: number) {
    const hasElimination = await this.matchModel
      .exists({ tournamentId, stage: MatchStage.ELIMINATION })
      .exec();
    if (hasElimination)
      throw new BadRequestException(
        'Eleme başladıktan sonra katılımcı eklenemez',
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
