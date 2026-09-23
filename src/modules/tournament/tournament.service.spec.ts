import { BadRequestException } from '@nestjs/common';
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
  tablesInRound = 1,
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
    create: jest.fn().mockResolvedValue({ _id: 5 }),
  };
  const participantModel = {
    find: jest.fn().mockReturnValue(query(participants)),
    findById: jest.fn().mockReturnValue(query(participants[0] ?? null)),
    findByIdAndUpdate: jest.fn().mockReturnValue(query({})),
    findByIdAndDelete: jest.fn().mockReturnValue(query({})),
  };
  const matchModel = {
    find: jest.fn().mockReturnValue(query(matches)),
    findById: jest.fn().mockReturnValue(query(match)),
    findByIdAndUpdate: jest.fn().mockReturnValue(query(match)),
    exists: jest.fn().mockReturnValue(query(exists)),
    countDocuments: jest.fn().mockReturnValue(query(tablesInRound)),
    create: jest.fn().mockImplementation(async (docs) => docs),
  };
  const websocketGateway = { emitTournamentChanged: jest.fn() };
  const service = new TournamentService(
    tournamentModel as any,
    registrationModel as any,
    participantModel as any,
    matchModel as any,
    websocketGateway as any,
  );
  return {
    service,
    tournamentModel,
    registrationModel,
    participantModel,
    matchModel,
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
      }),
    );
  });

  it('turnuva başladıysa kaydı reddeder', async () => {
    const { service } = createService({
      tournament: { ...baseTournament, status: TournamentStatus.ONGOING },
    });
    await expect(
      service.register('catan', { fullName: 'Ali', phone: '1' }),
    ).rejects.toThrow('Bu turnuvanın kayıtları kapandı');
  });

  it('son kayıt tarihi geçtiyse reddeder', async () => {
    const { service } = createService({
      tournament: {
        ...baseTournament,
        registrationDeadline: new Date(Date.now() - 1000),
      },
    });
    await expect(
      service.register('catan', { fullName: 'Ali', phone: '1' }),
    ).rejects.toThrow('Bu turnuvanın kayıtları kapandı');
  });

  it('aynı telefonla ikinci başvuruyu anlaşılır mesajla reddeder', async () => {
    const { service, registrationModel } = createService();
    registrationModel.create.mockRejectedValue({ code: 11000 });
    await expect(
      service.register('catan', { fullName: 'Ali', phone: '1' }),
    ).rejects.toThrow('Bu telefon numarasıyla zaten başvuru yapılmış');
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
      'En küçük masa, masa başına oyuncu sayısından büyük olamaz',
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
      },
      { new: true },
    );
    expect(tournamentModel.findByIdAndUpdate).toHaveBeenCalledWith(1, {
      status: TournamentStatus.FINISHED,
    });
  });
});

describe('TournamentService.removeParticipant', () => {
  it('maç oynamış katılımcıyı silmez, pasife alır', async () => {
    const { service, participantModel, matchModel } = createService({
      participants: [{ _id: 4, tournamentId: 1 }],
    });
    matchModel.exists
      .mockReturnValueOnce(query(null)) // açık maçta değil
      .mockReturnValueOnce(query({ _id: 1 })); // maç oynamış
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

  it('açık maçtaki katılımcıyı çıkarmaz', async () => {
    const { service, matchModel } = createService({
      participants: [{ _id: 4, tournamentId: 1 }],
    });
    matchModel.exists.mockReturnValueOnce(query({ _id: 1 }));
    await expect(service.removeParticipant(4)).rejects.toThrow(
      'Katılımcı skoru girilmemiş bir maçta, önce maçı tamamlayın',
    );
  });
});
