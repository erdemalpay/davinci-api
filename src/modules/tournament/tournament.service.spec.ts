jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { BadRequestException } from '@nestjs/common';
import * as moment from 'moment-timezone';
import {
  MatchStage,
  PairingMode,
  TournamentFormat,
} from './tournament.round-plan';
import { TournamentStatus } from './schemas/tournament.schema';
import { TournamentService } from './tournament.service';

const query = (value: unknown) => ({
  exec: jest.fn().mockResolvedValue(value),
});

const baseTournament = {
  _id: 1,
  slug: 'catan',
  status: TournamentStatus.NOT_STARTED,
  isRegistrationOpen: true,
  hasEntryFee: false,
  format: TournamentFormat.LEAGUE_THEN_ELIMINATION,
  pairingMode: PairingMode.SWISS,
  tableSize: 3,
  minTableSize: 3,
  leagueRounds: 1,
  placementPoints: [4, 2, 0],
  byePoints: 4,
  advanceCount: 3,
  advancePerTable: 1,
};

const createService = ({
  tournament = baseTournament as Record<string, unknown> | null,
  participants = [] as unknown[],
  matches = [] as unknown[],
  match = null as unknown,
  exists = null as unknown,
  blockingMatch = null as unknown,
  tablesInRound = 1,
  registration = null as Record<string, unknown> | null,
} = {}) => {
  const tournamentDoc = tournament && {
    ...tournament,
    toObject: () => tournament,
  };
  const tournamentModel = {
    findOne: jest.fn().mockReturnValue(query(tournamentDoc)),
    findByIdAndUpdate: jest.fn().mockReturnValue(query(tournamentDoc)),
  };
  const registrationModel = {
    create: jest.fn().mockImplementation(async (doc) => ({ _id: 5, ...doc })),
    findOne: jest.fn().mockReturnValue(query(registration)),
    find: jest.fn().mockReturnValue(query(registration ? [registration] : [])),
    findByIdAndUpdate: jest.fn().mockReturnValue(query({})),
    findByIdAndDelete: jest.fn().mockReturnValue(query({})),
  };
  const participantModel = {
    find: jest.fn().mockReturnValue(query(participants)),
    findById: jest.fn().mockReturnValue(query(participants[0] ?? null)),
    findByIdAndUpdate: jest.fn().mockReturnValue(query({})),
    findByIdAndDelete: jest.fn().mockReturnValue(query({})),
    exists: jest.fn().mockReturnValue(query(null)),
    countDocuments: jest.fn().mockReturnValue(query(0)),
    create: jest.fn(),
  };
  const matchModel = {
    find: jest.fn().mockReturnValue(query(matches)),
    findById: jest.fn().mockReturnValue(query(match)),
    findByIdAndUpdate: jest.fn().mockReturnValue(query(match)),
    findByIdAndDelete: jest.fn().mockReturnValue(query({})),
    deleteMany: jest.fn().mockReturnValue(query({})),
    exists: jest.fn().mockReturnValue(query(exists)),
    findOne: jest.fn().mockReturnValue(query(blockingMatch)),
    countDocuments: jest.fn().mockReturnValue(query(tablesInRound)),
    create: jest.fn().mockImplementation(async (docs) => docs),
  };
  const websocketGateway = { emitTournamentChanged: jest.fn() };
  const tournamentMailService = {
    sendRegistrationMail: jest.fn().mockResolvedValue(true),
  };
  const service = new TournamentService(
    tournamentModel as any,
    registrationModel as any,
    participantModel as any,
    matchModel as any,
    websocketGateway as any,
    tournamentMailService as any,
  );
  return {
    service,
    tournamentModel,
    registrationModel,
    participantModel,
    matchModel,
    tournamentMailService,
  };
};

describe('TournamentService.register', () => {
  it('telefondaki boşlukları temizler, e-postayı küçültür', async () => {
    const { service, registrationModel } = createService();
    await service.register('catan', {
      fullName: 'Ali',
      phone: '0555 000 00 00',
      email: 'Ali@Mail.com',
    });
    expect(registrationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '05550000000',
        email: 'ali@mail.com',
        tournamentId: 1,
        checkInCode: expect.stringMatching(/^[0-9a-f]{16}$/),
      }),
    );
  });

  it('kayıt oluşunca turnuva ve kayıtla birlikte mail gönderir', async () => {
    const { service, registrationModel, tournamentMailService } =
      createService();
    const registration = { _id: 5, email: 'ali@mail.com' };
    registrationModel.create.mockResolvedValue(registration);
    await service.register('catan', {
      fullName: 'Ali',
      phone: '0555 000 00 00',
      email: 'Ali@Mail.com',
    });
    expect(tournamentMailService.sendRegistrationMail).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 1 }),
      registration,
    );
  });

  it('kayıt reddedilirse mail göndermez', async () => {
    const { service, registrationModel, tournamentMailService } =
      createService();
    registrationModel.create.mockRejectedValue({ code: 11000 });
    await expect(
      service.register('catan', {
        fullName: 'Ali',
        phone: '0555 000 00 00',
        email: 'ali@mail.com',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tournamentMailService.sendRegistrationMail).not.toHaveBeenCalled();
  });

  it('turnuva başladıysa kaydı reddeder', async () => {
    const { service } = createService({
      tournament: { ...baseTournament, status: TournamentStatus.ONGOING },
    });
    await expect(
      service.register('catan', {
        fullName: 'Ali',
        phone: '1',
        email: 'ali@mail.com',
      }),
    ).rejects.toThrow('Bu turnuvanın kayıtları kapandı');
  });

  // Panelden gelen tarih gibi: seçilen günün UTC gece yarısı
  const istanbulDay = (offsetDays: number) =>
    new Date(
      moment.tz('Europe/Istanbul').add(offsetDays, 'day').format('YYYY-MM-DD'),
    );

  it('son kayıt günü dahil başvuru alır', async () => {
    const { service } = createService({
      tournament: { ...baseTournament, registrationDeadline: istanbulDay(0) },
    });
    await expect(
      service.register('catan', {
        fullName: 'Ali',
        phone: '1',
        email: 'ali@mail.com',
      }),
    ).resolves.toEqual({ _id: 5, checkInCode: expect.any(String) });
  });

  it('son kayıt tarihi geçtiyse reddeder', async () => {
    const { service } = createService({
      tournament: { ...baseTournament, registrationDeadline: istanbulDay(-1) },
    });
    await expect(
      service.register('catan', {
        fullName: 'Ali',
        phone: '1',
        email: 'ali@mail.com',
      }),
    ).rejects.toThrow('Bu turnuvanın kayıtları kapandı');
  });

  it('aynı telefonla ikinci başvuruyu anlaşılır mesajla reddeder', async () => {
    const { service, registrationModel } = createService();
    registrationModel.create.mockRejectedValue({ code: 11000 });
    await expect(
      service.register('catan', {
        fullName: 'Ali',
        phone: '1',
        email: 'ali@mail.com',
      }),
    ).rejects.toThrow('Bu telefon numarasıyla zaten başvuru yapılmış');
  });

  // Gerçek Mongo'daki $inc gibi: her çağrı sayacı bir artırıp yeni değeri döner
  const counter = (tournamentModel: { findByIdAndUpdate: jest.Mock }) => {
    let count = 0;
    tournamentModel.findByIdAndUpdate.mockImplementation(() =>
      query({ registrationCount: ++count }),
    );
  };
  const registerMany = (service: TournamentService, n: number) =>
    Promise.allSettled(
      Array.from({ length: n }, (_, i) =>
        service.register('catan', {
          fullName: `Oyuncu ${i}`,
          phone: `${i}`,
          email: `o${i}@mail.com`,
        }),
      ),
    );

  it('aynı anda gelen kayıtlara sayaçtan tekrarsız sıra numarası verir', async () => {
    const { service, tournamentModel, registrationModel } = createService({
      tournament: { ...baseTournament, capacity: 64 },
    });
    counter(tournamentModel);
    await registerMany(service, 100);
    const sequences = registrationModel.findByIdAndUpdate.mock.calls
      .map(([, update]) => update.sequence)
      .sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it('asil + yedek kontenjanı dolunca "Kayıtlar doldu" der ve kaydı siler', async () => {
    const {
      service,
      tournamentModel,
      registrationModel,
      tournamentMailService,
    } = createService({
      tournament: { ...baseTournament, capacity: 64, waitlistCapacity: 20 },
    });
    counter(tournamentModel);
    const results = await registerMany(service, 100);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(16);
    expect(rejected[0]).toMatchObject({
      reason: expect.objectContaining({ message: 'Kayıtlar doldu' }),
    });
    expect(registrationModel.findByIdAndDelete).toHaveBeenCalledTimes(16);
    expect(tournamentMailService.sendRegistrationMail).toHaveBeenCalledTimes(
      84,
    );
  });

  it('kontenjanı aşan kayda yedek numarasını ve yedek notunu döner', async () => {
    const { service, tournamentModel } = createService({
      tournament: {
        ...baseTournament,
        capacity: 64,
        waitlistNote: 'Sırayla alınırsınız',
      },
    });
    tournamentModel.findByIdAndUpdate.mockReturnValue(
      query({ registrationCount: 67 }),
    );
    await expect(
      service.register('catan', {
        fullName: 'Can',
        phone: '1',
        email: 'c@mail.com',
      }),
    ).resolves.toEqual({
      _id: 5,
      checkInCode: expect.any(String),
      registrationStatus: 'Yedek 3',
      waitlistNote: 'Sırayla alınırsınız',
    });
  });

  it('asile durumunu döner, yedek notunu dönmez', async () => {
    const { service, tournamentModel } = createService({
      tournament: { ...baseTournament, capacity: 64, waitlistNote: 'Sırayla' },
    });
    tournamentModel.findByIdAndUpdate.mockReturnValue(
      query({ registrationCount: 64 }),
    );
    await expect(
      service.register('catan', {
        fullName: 'Ece',
        phone: '2',
        email: 'e@mail.com',
      }),
    ).resolves.toEqual({
      _id: 5,
      checkInCode: expect.any(String),
      registrationStatus: 'Asil',
    });
  });

  it('aynı telefonla tekrar başvuran sayaçtan numara almaz', async () => {
    const { service, registrationModel, tournamentModel } = createService();
    registrationModel.create.mockRejectedValue({ code: 11000 });
    await expect(
      service.register('catan', {
        fullName: 'Ali',
        phone: '1',
        email: 'a@mail.com',
      }),
    ).rejects.toThrow('Bu telefon numarasıyla zaten başvuru yapılmış');
    expect(tournamentModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

describe('TournamentService.findPublicBySlug', () => {
  it('kayıt formunda gösterilecek katılım bilgisini döner, kalan yeri dönmez', async () => {
    const { service } = createService({
      tournament: {
        ...baseTournament,
        capacity: 64,
        participationNote: 'Hafta sonu giriş ücreti',
      },
    });
    const result = await service.findPublicBySlug('catan');
    expect(result.participationNote).toBe('Hafta sonu giriş ücreti');
    expect(result).not.toHaveProperty('capacity');
  });
});

describe('TournamentService.findOpenForRegistration', () => {
  it('son kayıt tarihi geçenleri çıkarır, sadece menüye gerekli alanları döner', async () => {
    const { service, tournamentModel } = createService();
    (tournamentModel as any).find = jest.fn().mockReturnValue({
      sort: () =>
        query([
          { ...baseTournament, name: 'Catan', date: '2026-10-10' },
          {
            ...baseTournament,
            _id: 2,
            slug: 'azul',
            registrationDeadline: new Date('2000-01-01'),
          },
        ]),
    });
    await expect(service.findOpenForRegistration()).resolves.toEqual([
      { _id: 1, name: 'Catan', date: '2026-10-10', slug: 'catan' },
    ]);
  });
});

describe('TournamentService.update', () => {
  it('başladıktan sonra kural değişikliğini reddeder', async () => {
    const { service } = createService({
      tournament: { ...baseTournament, status: TournamentStatus.ONGOING },
    });
    await expect(service.update(1, { tableSize: 4 })).rejects.toThrow(
      'Turnuva başladıktan sonra kurallar değiştirilemez',
    );
  });

  it('başladıktan sonra kural dışı alanları değiştirebilir', async () => {
    const { service, tournamentModel } = createService({
      tournament: { ...baseTournament, status: TournamentStatus.ONGOING },
    });
    await service.update(1, { name: 'Yeni ad' });
    expect(tournamentModel.findByIdAndUpdate).toHaveBeenCalledWith(
      1,
      { name: 'Yeni ad' },
      { new: true },
    );
  });

  it('en küçük masa masa boyutundan büyükse reddeder', async () => {
    const { service } = createService();
    await expect(service.update(1, { minTableSize: 4 })).rejects.toThrow(
      'En küçük masa 2 ile masa başına oyuncu sayısı arasında olmalı',
    );
  });

  it('doğrudan elemede Swiss ayarlarını istemez', async () => {
    const { service, tournamentModel } = createService();
    await service.update(1, {
      format: TournamentFormat.ELIMINATION,
      leagueRounds: 0,
      placementPoints: [],
    });
    expect(tournamentModel.findByIdAndUpdate).toHaveBeenCalled();
  });

  it('eksik masa puanlarında sayı olmayan değeri reddeder', async () => {
    const { service } = createService();
    await expect(
      service.update(1, { placementPointsBySize: { 2: ['4', 0] } } as never),
    ).rejects.toThrow('Eksik masa puanları sayılardan oluşmalı');
  });

  it('sadece Swiss formatında en az 1 tur ister', async () => {
    const { service } = createService();
    await expect(
      service.update(1, { format: TournamentFormat.LEAGUE, leagueRounds: 0 }),
    ).rejects.toThrow('Puan turlarında en az 1 tur olmalı');
  });

  it('3.lük maçını sadece 2 kişilik elemede kabul eder', async () => {
    const { service, tournamentModel } = createService();
    await expect(service.update(1, { thirdPlaceMatch: true })).rejects.toThrow(
      "3.'lük maçı sadece 2 kişilik masalarla oynanan elemede açılabilir",
    );
    await service.update(1, { thirdPlaceMatch: true, eliminationTableSize: 2 });
    expect(tournamentModel.findByIdAndUpdate).toHaveBeenCalled();
  });

  it('masadan çıkan sayısını eleme masasına göre denetler', async () => {
    const { service } = createService();
    await expect(
      service.update(1, { eliminationTableSize: 2, advancePerTable: 2 }),
    ).rejects.toThrow(
      'Masadan çıkacak kişi sayısı 1 ile eleme masası büyüklüğü arasında olmalı',
    );
  });
});

describe('TournamentService.generateNextRound', () => {
  afterEach(() => jest.restoreAllMocks());

  it('bayı tamamlanmış maç olarak yazar ve kaydı kapatır', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9999);
    const participants = [1, 2, 3, 4, 5, 6, 7].map((_id) => ({ _id }));
    const { service, matchModel, tournamentModel } = createService({
      participants,
    });

    await service.generateNextRound(1);

    const docs = matchModel.create.mock.calls[0][0];
    expect(docs.filter((d) => !d.isBye)).toHaveLength(2);
    expect(docs.find((d) => d.isBye)).toMatchObject({
      stage: MatchStage.LEAGUE,
      round: 1,
      tableNo: 0,
      isCompleted: true,
      players: [{ participantId: 7, points: 4 }],
    });
    expect(tournamentModel.findByIdAndUpdate).toHaveBeenCalledWith(1, {
      status: TournamentStatus.ONGOING,
      isRegistrationOpen: false,
      roundExtraMinutes: 0,
      isRoundTimerStopped: false,
      roundPausedAt: null,
      roundPausedSeconds: 0,
    });
  });

  it('skorlanmamış maç varken Türkçe hata verir', async () => {
    const { service } = createService({
      participants: [{ _id: 1 }, { _id: 2 }, { _id: 3 }],
      matches: [
        {
          stage: MatchStage.LEAGUE,
          round: 1,
          tableNo: 1,
          isBye: false,
          isCompleted: false,
          players: [],
        },
      ],
    });
    await expect(service.generateNextRound(1)).rejects.toThrow(
      new BadRequestException(
        'Skoru girilmemiş maçlar var, önce onları tamamlayın',
      ),
    );
  });

  it('karar bekleyen beraberlik varken yeni tur üretmez', async () => {
    const { service } = createService({
      tournament: { ...baseTournament, status: TournamentStatus.ONGOING },
      matches: [
        {
          stage: MatchStage.ELIMINATION,
          round: 1,
          isCompleted: true,
          pendingTie: { participantIds: [1, 2], slots: 1 },
          players: [],
        },
      ],
    });
    await expect(service.generateNextRound(1)).rejects.toThrow(
      'Berabere kalan masada karar verilmeden sonraki tur oluşturulamaz',
    );
  });

  it('bitmiş turnuvada yeni tur üretmez', async () => {
    const { service } = createService({
      tournament: { ...baseTournament, status: TournamentStatus.FINISHED },
    });
    await expect(service.generateNextRound(1)).rejects.toThrow(
      'Turnuva tamamlandı',
    );
  });
});

describe('TournamentService.submitScores', () => {
  const tableMatch = {
    _id: 9,
    tournamentId: 1,
    stage: MatchStage.ELIMINATION,
    round: 1,
    isBye: false,
    players: [{ participantId: 1 }, { participantId: 2 }, { participantId: 3 }],
  };
  const scores = [
    { participantId: 3, score: 5 },
    { participantId: 1, score: 50 },
    { participantId: 2, score: 30 },
  ];

  it('bay maçına skor girilmesini reddeder', async () => {
    const { service } = createService({
      match: { ...tableMatch, isBye: true },
    });
    await expect(service.submitScores(9, { scores })).rejects.toThrow(
      'Bay maçına skor girilmez',
    );
  });

  it('masada olmayan oyuncuyu reddeder', async () => {
    const { service } = createService({ match: tableMatch });
    await expect(
      service.submitScores(9, {
        scores: [...scores.slice(1), { participantId: 99, score: 1 }],
      }),
    ).rejects.toThrow('Skorlar masadaki oyuncularla eşleşmiyor');
  });

  it('sonraki tur kurulduysa skoru değiştirtmez', async () => {
    const { service } = createService({
      match: tableMatch,
      exists: { _id: 10 },
    });
    await expect(service.submitScores(9, { scores })).rejects.toThrow(
      'Sonraki tur oluşturulduğu için bu maçın skoru değiştirilemez',
    );
  });

  it('sıraya göre puanı yazar, final masasıysa turnuvayı bitirir', async () => {
    const { service, matchModel, tournamentModel } = createService({
      match: tableMatch,
      tablesInRound: 1,
    });
    await service.submitScores(9, { scores });

    expect(matchModel.findByIdAndUpdate).toHaveBeenCalledWith(
      9,
      {
        players: [
          { participantId: 1, score: 50, rank: 1, points: 4 },
          { participantId: 2, score: 30, rank: 2, points: 2 },
          { participantId: 3, score: 5, rank: 3, points: 0 },
        ],
        isCompleted: true,
        pendingTie: null,
      },
      { new: true },
    );
    expect(tournamentModel.findByIdAndUpdate).toHaveBeenCalledWith(1, {
      status: TournamentStatus.FINISHED,
    });
  });

  it('finalde 1.lik berabereyse karar bekler, turnuvayı bitirmez', async () => {
    const { service, matchModel, tournamentModel } = createService({
      match: tableMatch,
      tablesInRound: 1,
    });
    await service.submitScores(9, {
      scores: [
        { participantId: 1, score: 50 },
        { participantId: 2, score: 50 },
        { participantId: 3, score: 5 },
      ],
    });

    expect(matchModel.findByIdAndUpdate.mock.calls[0][1].pendingTie).toEqual({
      participantIds: [1, 2],
      slots: 1,
    });
    expect(tournamentModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('3.lük masası skorlanmadıysa final oynansa da turnuvayı bitirmez', async () => {
    const { service, matchModel, tournamentModel } = createService({
      match: tableMatch,
      tablesInRound: 1,
    });
    matchModel.exists
      .mockReturnValueOnce(query(null)) // sonraki tur yok
      .mockReturnValueOnce(query({ _id: 11 })); // 3.lük masası açık
    await service.submitScores(9, { scores });

    expect(tournamentModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

describe('TournamentService.resolveTie', () => {
  const tiedFinal = {
    _id: 9,
    tournamentId: 1,
    stage: MatchStage.ELIMINATION,
    round: 2,
    isBye: false,
    pendingTie: { participantIds: [1, 2], slots: 1 },
    players: [
      { participantId: 1, score: 50, rank: 1, points: 4 },
      { participantId: 2, score: 50, rank: 1, points: 4 },
      { participantId: 3, score: 5, rank: 3, points: 0 },
    ],
  };

  it('seçileni öne alır, diğerini bir alt sıraya indirir ve finali bitirir', async () => {
    const { service, matchModel, tournamentModel } = createService({
      match: tiedFinal,
      tablesInRound: 1,
    });
    await service.resolveTie(9, { winnerIds: [2] });

    expect(matchModel.findByIdAndUpdate).toHaveBeenCalledWith(
      9,
      {
        players: [
          {
            participantId: 2,
            score: 50,
            rank: 1,
            points: 4,
            wonTieBreak: true,
          },
          { participantId: 1, score: 50, rank: 2, points: 4 },
          { participantId: 3, score: 5, rank: 3, points: 0 },
        ],
        pendingTie: null,
      },
      { new: true },
    );
    expect(tournamentModel.findByIdAndUpdate).toHaveBeenCalledWith(1, {
      status: TournamentStatus.FINISHED,
    });
  });

  it('berabere olmayan ya da eksik seçimi reddeder', async () => {
    const { service } = createService({ match: tiedFinal });
    await expect(service.resolveTie(9, { winnerIds: [3] })).rejects.toThrow(
      'Berabere kalanlardan 1 kişi seçilmeli',
    );
    await expect(service.resolveTie(9, { winnerIds: [1, 2] })).rejects.toThrow(
      'Berabere kalanlardan 1 kişi seçilmeli',
    );
    // Elemede beraberlik olduğu gibi bırakılamaz
    await expect(service.resolveTie(9, { winnerIds: [] })).rejects.toThrow(
      'Berabere kalanlardan 1 kişi seçilmeli',
    );
  });

  it('karar bekleyen beraberlik yoksa reddeder', async () => {
    const { service } = createService({
      match: { ...tiedFinal, pendingTie: null },
    });
    await expect(service.resolveTie(9, { winnerIds: [1] })).rejects.toThrow(
      'Bu masada karar bekleyen beraberlik yok',
    );
  });
});

describe('TournamentService.resolveTie (puan turları)', () => {
  const tiedLeague = {
    _id: 9,
    tournamentId: 1,
    stage: MatchStage.LEAGUE,
    round: 1,
    isBye: false,
    pendingTie: { participantIds: [1, 2], slots: 1 },
    players: [
      { participantId: 1, score: 50, rank: 1, points: 4 },
      { participantId: 2, score: 50, rank: 1, points: 4 },
      { participantId: 3, score: 5, rank: 3, points: 0 },
    ],
  };
  const savedPlayers = (matchModel: { findByIdAndUpdate: jest.Mock }) =>
    matchModel.findByIdAndUpdate.mock.calls[0][1];

  it('seçilen üst sıranın, diğeri bir alt sıranın puanını alır', async () => {
    const { service, matchModel } = createService({ match: tiedLeague });
    await service.resolveTie(9, { winnerIds: [2] });
    const { players, pendingTie } = savedPlayers(matchModel);
    expect(players.map((p) => [p.participantId, p.rank, p.points])).toEqual([
      [2, 1, 4],
      [1, 2, 2],
      [3, 3, 0],
    ]);
    expect(pendingTie).toBeNull();
  });

  it('berabere bırakılırsa ikisi de aynı sıranın puanını korur', async () => {
    const { service, matchModel } = createService({ match: tiedLeague });
    await service.resolveTie(9, { winnerIds: [] });
    const { players, pendingTie } = savedPlayers(matchModel);
    expect(players.map((p) => p.points)).toEqual([4, 4, 0]);
    expect(pendingTie).toBeNull();
  });

  it('berabere bırakılırken verilen puanı sadece eşitlere yazar', async () => {
    const { service, matchModel } = createService({ match: tiedLeague });
    await service.resolveTie(9, { winnerIds: [], points: 3 });
    const { players } = savedPlayers(matchModel);
    expect(players.map((p) => p.points)).toEqual([3, 3, 0]);
  });

  it('birini seçerken elle puanı reddeder', async () => {
    const { service } = createService({ match: tiedLeague });
    await expect(
      service.resolveTie(9, { winnerIds: [2], points: 3 }),
    ).rejects.toThrow(
      'Elle puan sadece puan turlarında beraberlik bırakılırken verilebilir',
    );
  });

  it('üçlü eşitlikte seçimden sonra kalan ikisini ayrıca sorar', async () => {
    const { service, matchModel } = createService({
      match: {
        ...tiedLeague,
        pendingTie: { participantIds: [1, 2, 3], slots: 1 },
        players: [1, 2, 3].map((participantId) => ({
          participantId,
          score: 50,
          rank: 1,
          points: 4,
        })),
      },
    });
    await service.resolveTie(9, { winnerIds: [3] });
    expect(savedPlayers(matchModel).pendingTie).toEqual({
      participantIds: [1, 2],
      slots: 1,
    });
  });
});

describe('TournamentService.addParticipant', () => {
  it('tur aralarında geç gelen oyuncuyu ekler', async () => {
    const { service, participantModel } = createService();
    (participantModel as any).create = jest.fn().mockResolvedValue({ _id: 7 });
    await service.addParticipant(1, { name: 'Geç Gelen' });
    expect((participantModel as any).create).toHaveBeenCalledWith({
      tournamentId: 1,
      name: 'Geç Gelen',
    });
  });

  it('eleme başladıysa reddeder', async () => {
    const { service } = createService({ exists: { _id: 1 } });
    await expect(
      service.addParticipant(1, { name: 'Geç Gelen' }),
    ).rejects.toThrow('Eleme başladıktan sonra katılımcı eklenemez');
  });

  it('tur sürerken de ekler (sonraki turdan eşleşir)', async () => {
    const { service, participantModel } = createService({
      blockingMatch: { stage: MatchStage.LEAGUE, isCompleted: false },
    });
    participantModel.create.mockResolvedValue({ _id: 7 });
    await service.addParticipant(1, { name: 'Geç Gelen' });
    expect(participantModel.create).toHaveBeenCalled();
  });
});

describe('TournamentService.findLiveBySlug', () => {
  it('katılımcıların sadece adını ve durumunu döner', async () => {
    const { service, participantModel, matchModel } = createService();
    const sorted = (value: unknown) => ({ sort: () => query(value) });
    participantModel.find.mockReturnValue(
      sorted([{ _id: 4, name: 'Ayşe', isActive: true, registrationId: 9 }]),
    );
    matchModel.find.mockReturnValue(sorted([]));
    const live = await service.findLiveBySlug('catan');
    expect(live.participants).toEqual([
      { _id: 4, name: 'Ayşe', isActive: true },
    ]);
  });
});

describe('TournamentService.checkIn', () => {
  const registration = {
    _id: 5,
    tournamentId: 1,
    fullName: 'Ayşe Yılmaz',
    sequence: 3,
  };
  const paid = { ...baseTournament, capacity: 64, hasEntryFee: true };

  it('ücretsiz turnuvada QR sahibini katılımcı yapar ve gelişini yazar', async () => {
    const { service, participantModel, registrationModel } = createService({
      registration,
    });
    participantModel.create.mockResolvedValue([]);
    await expect(service.checkIn(1, { code: 'abc' })).resolves.toEqual({
      registrationId: 5,
      fullName: 'Ayşe Yılmaz',
      hasEntryFee: false,
      isParticipant: true,
    });
    expect(registrationModel.findByIdAndUpdate).toHaveBeenCalledWith(5, {
      arrivedAt: expect.any(Date),
    });
    expect(participantModel.create).toHaveBeenCalledWith([
      { tournamentId: 1, name: 'Ayşe Yılmaz', registrationId: 5 },
    ]);
  });

  it('ücretli turnuvada asili ödeme alınana kadar katılımcı yapmaz', async () => {
    const { service, participantModel } = createService({
      tournament: paid,
      registration,
    });
    await expect(service.checkIn(1, { code: 'abc' })).resolves.toMatchObject({
      hasEntryFee: true,
      isParticipant: false,
    });
    expect(participantModel.create).not.toHaveBeenCalled();
  });

  it('yedeği katılımcı yapmaz, yedek numarasını döner', async () => {
    const { service, participantModel } = createService({
      tournament: { ...baseTournament, capacity: 2 },
      registration,
    });
    await expect(service.checkIn(1, { code: 'abc' })).resolves.toMatchObject({
      waitlistNumber: 1,
      isParticipant: false,
    });
    expect(participantModel.create).not.toHaveBeenCalled();
  });

  it('ikinci kez okutulunca geliş saatini ezmez', async () => {
    const { service, registrationModel } = createService({
      tournament: paid,
      registration: {
        ...registration,
        arrivedAt: new Date('2026-11-02T09:00:00Z'),
      },
    });
    await service.checkIn(1, { code: 'abc' });
    expect(registrationModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('zaten katılımcı olanı tekrar eklemez', async () => {
    const { service, participantModel } = createService({ registration });
    participantModel.exists.mockReturnValue(query({ _id: 9 }));
    await expect(service.checkIn(1, { code: 'abc' })).rejects.toThrow(
      'Ayşe Yılmaz zaten katılımcı',
    );
  });

  it("başka turnuvanın QR'ını reddeder", async () => {
    const { service } = createService({ registration });
    await expect(service.checkIn(2, { code: 'abc' })).rejects.toThrow(
      'Bu QR bu turnuvaya ait değil',
    );
  });

  it('tanınmayan QR için hata verir', async () => {
    const { service } = createService();
    await expect(service.checkIn(1, { code: 'yok' })).rejects.toThrow(
      'QR bulunamadı',
    );
  });
});

describe('TournamentService.admitRegistration', () => {
  const registration = {
    _id: 5,
    tournamentId: 1,
    fullName: 'Can Demir',
    sequence: 66,
  };
  const paid = { ...baseTournament, capacity: 64, hasEntryFee: true };

  it('ödemeyi işaretler ve katılımcı yapar', async () => {
    const { service, participantModel, registrationModel } = createService({
      tournament: paid,
      registration,
    });
    participantModel.create.mockResolvedValue([]);
    await expect(service.admitRegistration(1, 5)).resolves.toEqual({
      fullName: 'Can Demir',
    });
    expect(registrationModel.findByIdAndUpdate).toHaveBeenCalledWith(5, {
      isPaid: true,
    });
    expect(participantModel.create).toHaveBeenCalledWith([
      { tournamentId: 1, name: 'Can Demir', registrationId: 5 },
    ]);
  });

  it('ücretsiz turnuvada ödeme işaretlemez', async () => {
    const { service, participantModel, registrationModel } = createService({
      registration,
    });
    participantModel.create.mockResolvedValue([]);
    await service.admitRegistration(1, 5);
    expect(registrationModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('kontenjan doluysa katılımcı yapmaz ve ödeme işaretlemez', async () => {
    const { service, participantModel, registrationModel } = createService({
      tournament: paid,
      registration,
    });
    participantModel.countDocuments.mockReturnValue(query(64));
    await expect(service.admitRegistration(1, 5)).rejects.toThrow(
      'Kontenjan dolu',
    );
    expect(registrationModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(participantModel.create).not.toHaveBeenCalled();
  });

  it('turnuvada olmayan başvuruyu reddeder', async () => {
    const { service } = createService();
    await expect(service.admitRegistration(1, 99)).rejects.toThrow(
      'Başvuru bulunamadı',
    );
  });
});

describe('TournamentService.removeParticipant', () => {
  const openTable = (...ids: number[]) => ({
    _id: 9,
    isCompleted: false,
    players: ids.map((participantId) => ({ participantId })),
  });

  it('maç oynamış katılımcıyı silmez, pasife alır', async () => {
    const { service, participantModel } = createService({
      participants: [{ _id: 4, tournamentId: 1 }],
      exists: { _id: 1 }, // skoru girilmiş maçı var
    });
    await service.removeParticipant(4);
    expect(participantModel.findByIdAndUpdate).toHaveBeenCalledWith(
      4,
      { isActive: false },
      { new: true },
    );
    expect(participantModel.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('hiç oynamamış katılımcıyı siler', async () => {
    const { service, participantModel } = createService({
      participants: [{ _id: 4, tournamentId: 1 }],
    });
    await service.removeParticipant(4);
    expect(participantModel.findByIdAndDelete).toHaveBeenCalledWith(4);
  });

  it('skoru girilmemiş masadaysa masadan da kaldırır', async () => {
    const { service, matchModel } = createService({
      participants: [{ _id: 4, tournamentId: 1 }],
      blockingMatch: openTable(4, 5, 6),
    });
    await service.removeParticipant(4);
    expect(matchModel.findByIdAndUpdate).toHaveBeenCalledWith(9, {
      players: [{ participantId: 5 }, { participantId: 6 }],
    });
  });

  it('masada tek kişi kalacaksa reddeder', async () => {
    const { service, participantModel } = createService({
      participants: [{ _id: 4, tournamentId: 1 }],
      blockingMatch: openTable(4, 5),
    });
    await expect(service.removeParticipant(4)).rejects.toThrow(
      'Masada tek kişi kalıyor',
    );
    expect(participantModel.findByIdAndDelete).not.toHaveBeenCalled();
  });
});

describe('TournamentService.updateParticipant', () => {
  it('adı değiştirir', async () => {
    const { service, participantModel } = createService({
      participants: [{ _id: 4, tournamentId: 1, isActive: true }],
    });
    await service.updateParticipant(4, { name: 'Deniz Kemal Şahin' });
    expect(participantModel.findByIdAndUpdate).toHaveBeenCalledWith(
      4,
      { name: 'Deniz Kemal Şahin' },
      { new: true },
    );
  });

  it('eleme başladıysa çekilen oyuncuyu geri almaz', async () => {
    const { service } = createService({
      participants: [{ _id: 4, tournamentId: 1, isActive: false }],
      exists: { _id: 1 }, // eleme maçı var
    });
    await expect(
      service.updateParticipant(4, { isActive: true }),
    ).rejects.toThrow('Eleme başladıktan sonra katılımcı eklenemez');
  });
});

describe('TournamentService.moveParticipant', () => {
  const table = (_id: number, ids: number[], extra = {}) => ({
    _id,
    tournamentId: 1,
    stage: MatchStage.LEAGUE,
    round: 1,
    isCompleted: false,
    players: ids.map((participantId) => ({ participantId })),
    ...extra,
  });
  const setup = (target: unknown) =>
    createService({
      participants: [{ _id: 1, tournamentId: 1 }],
      blockingMatch: table(10, [1, 2, 3]),
      match: target,
    });

  it('iki masadaki oyuncuların yerini değiştirir', async () => {
    const { service, matchModel } = setup(table(11, [4, 5, 6]));
    await service.moveParticipant(1, { matchId: 11, swapWithId: 5 });
    expect(matchModel.findByIdAndUpdate).toHaveBeenCalledWith(10, {
      players: [
        { participantId: 5 },
        { participantId: 2 },
        { participantId: 3 },
      ],
    });
    expect(matchModel.findByIdAndUpdate).toHaveBeenCalledWith(11, {
      players: [
        { participantId: 4 },
        { participantId: 1 },
        { participantId: 6 },
      ],
    });
  });

  it('boş yeri olan masaya taşır', async () => {
    const { service, matchModel } = setup(table(11, [4, 5]));
    await service.moveParticipant(1, { matchId: 11 });
    expect(matchModel.findByIdAndUpdate).toHaveBeenCalledWith(10, {
      players: [{ participantId: 2 }, { participantId: 3 }],
    });
    expect(matchModel.findByIdAndUpdate).toHaveBeenCalledWith(11, {
      players: [
        { participantId: 4 },
        { participantId: 5 },
        { participantId: 1 },
      ],
    });
  });

  it('dolu masaya taşımaz', async () => {
    const { service } = setup(table(11, [4, 5, 6]));
    await expect(service.moveParticipant(1, { matchId: 11 })).rejects.toThrow(
      'Masa dolu',
    );
  });

  it('skoru girilmiş masaya dokunmaz', async () => {
    const { service } = setup(table(11, [4, 5], { isCompleted: true }));
    await expect(
      service.moveParticipant(1, { matchId: 11, swapWithId: 4 }),
    ).rejects.toThrow('skoru girilmemiş masaları arasında');
  });
});

describe('TournamentService.regenerateRound', () => {
  const leagueMatch = (round: number, extra = {}) => ({
    _id: round * 10,
    stage: MatchStage.LEAGUE,
    round,
    isBye: false,
    isCompleted: false,
    players: [],
    ...extra,
  });

  it('skor girilmiş turu yeniden eşleştirmez', async () => {
    const { service, matchModel } = createService({
      matches: [leagueMatch(1, { isCompleted: true })],
    });
    await expect(service.regenerateRound(1)).rejects.toThrow(
      'Skor girilmiş tur yeniden eşleştirilemez',
    );
    expect(matchModel.deleteMany).not.toHaveBeenCalled();
  });

  it('bay dışında skor yoksa son turu silip yeniden kurar', async () => {
    const { service, matchModel } = createService({
      matches: [
        leagueMatch(1, { isCompleted: true }),
        leagueMatch(2),
        leagueMatch(2, { _id: 21, isBye: true, isCompleted: true }),
      ],
    });
    const generate = jest
      .spyOn(service, 'generateNextRound')
      .mockResolvedValue([]);
    await service.regenerateRound(1);
    expect(matchModel.deleteMany).toHaveBeenCalledWith({
      _id: { $in: [20, 21] },
    });
    expect(generate).toHaveBeenCalledWith(1);
  });
});

describe('TournamentService.getStandings', () => {
  it('elemede final sıralamasını ve ulaşılan aşamayı döner', async () => {
    const { service } = createService({
      participants: [
        { _id: 1, name: 'Ali' },
        { _id: 2, name: 'Veli' },
        { _id: 3, name: 'Can' },
      ],
      matches: [
        {
          stage: MatchStage.ELIMINATION,
          round: 1,
          tableNo: 1,
          isBye: false,
          isCompleted: true,
          players: [
            { participantId: 2, rank: 1, points: 4 },
            { participantId: 1, rank: 2, points: 2 },
            { participantId: 3, rank: 3, points: 0 },
          ],
        },
      ],
    });
    const result = await service.getStandings(1);
    expect(result.map((r) => [r.rank, r.name])).toEqual([
      [1, 'Veli'],
      [2, 'Ali'],
      [3, 'Can'],
    ]);
    expect(result[0].elimination).toEqual({
      round: 1,
      isFinal: true,
      tableRank: 1,
    });
  });
});

describe('TournamentService.getStandings (puan turları)', () => {
  const participants = [
    { _id: 1, name: 'Ali' },
    { _id: 2, name: 'Veli' },
    { _id: 3, name: 'Can' },
  ];
  const leagueMatches = [
    {
      stage: MatchStage.LEAGUE,
      round: 1,
      tableNo: 1,
      isBye: false,
      isCompleted: true,
      players: [
        { participantId: 1, rank: 1, points: 4 },
        { participantId: 2, rank: 2, points: 2 },
      ],
    },
    {
      stage: MatchStage.LEAGUE,
      round: 1,
      tableNo: 0,
      isBye: true,
      isCompleted: true,
      players: [{ participantId: 3, points: 4 }],
    },
    {
      stage: MatchStage.LEAGUE,
      round: 2,
      tableNo: 1,
      isBye: false,
      isCompleted: true,
      players: [
        { participantId: 3, rank: 1, points: 4 },
        { participantId: 1, rank: 2, points: 2 },
      ],
    },
  ];

  it('her oyuncunun tur tur aldığı puanı ve bayı döner', async () => {
    const { service } = createService({
      participants,
      matches: leagueMatches,
    });
    const result = await service.getStandings(1);
    const ali = result.find((r) => r.name === 'Ali');
    const can = result.find((r) => r.name === 'Can');
    expect(ali?.rounds).toEqual([
      { round: 1, points: 4, isBye: false },
      { round: 2, points: 2, isBye: false },
    ]);
    expect(can?.rounds).toEqual([
      { round: 1, points: 4, isBye: true },
      { round: 2, points: 4, isBye: false },
    ]);
  });

  it('istenen puan turunun sonundaki tabloyu döner, sonraki tur ve eleme sayılmaz', async () => {
    const { service } = createService({
      participants,
      matches: [
        ...leagueMatches,
        {
          stage: MatchStage.ELIMINATION,
          round: 1,
          tableNo: 1,
          isBye: false,
          isCompleted: true,
          players: [
            { participantId: 2, rank: 1, points: 4 },
            { participantId: 3, rank: 2, points: 0 },
          ],
        },
      ],
    });
    const result = await service.getStandings(1, 1);
    expect(result.map((r) => [r.name, r.points, r.rounds.length])).toEqual([
      ['Ali', 4, 1],
      ['Can', 4, 1],
      ['Veli', 2, 1],
    ]);
    expect(result.some((r) => r.elimination)).toBe(false);
  });
});

describe('TournamentService.submitScores (sadece Swiss)', () => {
  const leagueTournament = {
    ...baseTournament,
    format: TournamentFormat.LEAGUE,
    leagueRounds: 2,
  };
  const leagueMatch = (round: number) => ({
    _id: 9,
    tournamentId: 1,
    stage: MatchStage.LEAGUE,
    round,
    isBye: false,
    players: [{ participantId: 1 }, { participantId: 2 }],
  });
  const scores = [
    { participantId: 1, score: 10 },
    { participantId: 2, score: 5 },
  ];

  it('son turun son maçı skorlanınca turnuvayı bitirir', async () => {
    const { service, tournamentModel } = createService({
      tournament: leagueTournament,
      match: leagueMatch(2),
    });
    await service.submitScores(9, { scores });
    expect(tournamentModel.findByIdAndUpdate).toHaveBeenCalledWith(1, {
      status: TournamentStatus.FINISHED,
    });
  });

  it('eksik masada o masa büyüklüğünün puanlarını yazar', async () => {
    const { service, matchModel } = createService({
      tournament: { ...leagueTournament, placementPointsBySize: { 2: [4, 0] } },
      match: leagueMatch(1),
    });
    await service.submitScores(9, { scores });
    const [, update] = matchModel.findByIdAndUpdate.mock.calls[0];
    expect(update.players.map((p) => p.points)).toEqual([4, 0]);
  });

  it('eşit skorda kimin üst sıraya geçeceğini sorar', async () => {
    const { service, matchModel } = createService({
      tournament: leagueTournament,
      match: leagueMatch(1),
    });
    await service.submitScores(9, {
      scores: [
        { participantId: 1, score: 10 },
        { participantId: 2, score: 10 },
      ],
    });
    expect(matchModel.findByIdAndUpdate.mock.calls[0][1].pendingTie).toEqual({
      participantIds: [1, 2],
      slots: 1,
    });
  });

  it('son tur değilse turnuvayı bitirmez', async () => {
    const { service, tournamentModel } = createService({
      tournament: leagueTournament,
      match: leagueMatch(1),
    });
    await service.submitScores(9, { scores });
    expect(tournamentModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
