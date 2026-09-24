import {
  FixtureError,
  MatchStage,
  MatchState,
  PairingMode,
  planNextRound,
  TournamentFormat,
  TournamentRules,
} from './tournament.round-plan';

// shuffle'ı sıralamayı bozmayacak şekilde sabitler
const noShuffle = () => 0.9999;

const rules = (overrides: Partial<TournamentRules> = {}): TournamentRules => ({
  format: TournamentFormat.LEAGUE_THEN_ELIMINATION,
  pairingMode: PairingMode.SWISS,
  tableSize: 3,
  minTableSize: 3,
  leagueRounds: 2,
  advanceCount: 4,
  advancePerTable: 2,
  ...overrides,
});

const table = (
  stage: MatchStage,
  round: number,
  tableNo: number,
  players: [number, number, number][], // [participantId, rank, points]
): MatchState => ({
  stage,
  round,
  tableNo,
  isBye: false,
  isCompleted: true,
  players: players.map(([participantId, rank, points]) => ({
    participantId,
    score: 0,
    rank,
    points,
  })),
});

const leagueRound1 = [
  table(MatchStage.LEAGUE, 1, 1, [
    [1, 1, 4],
    [2, 2, 2],
    [3, 3, 0],
  ]),
  table(MatchStage.LEAGUE, 1, 2, [
    [4, 1, 4],
    [5, 2, 2],
    [6, 3, 0],
  ]),
];

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('planNextRound', () => {
  it('skorlanmamış maç varken yeni tur üretmez', () => {
    const open = { ...leagueRound1[0], isCompleted: false };
    expect(() => planNextRound(rules(), ids(6), [open], noShuffle)).toThrow(
      new FixtureError('INCOMPLETE_ROUND'),
    );
  });

  it('1. lig turunu karıştırılmış listeyle kurar', () => {
    expect(planNextRound(rules(), ids(6), [], noShuffle)).toEqual({
      stage: MatchStage.LEAGUE,
      round: 1,
      tables: [
        { tableNo: 1, participantIds: [1, 2, 3] },
        { tableNo: 2, participantIds: [4, 5, 6] },
      ],
      byes: [],
    });
  });

  it('masa kurulamayanı bay geçirir', () => {
    expect(planNextRound(rules(), ids(7), [], noShuffle)?.byes).toEqual([7]);
  });

  it('Swiss modunda 2. turu puan sırasına göre kurar', () => {
    const next = planNextRound(rules(), ids(6), leagueRound1, noShuffle);
    expect(next?.round).toBe(2);
    expect(next?.tables.map((t) => t.participantIds)).toEqual([
      [1, 4, 2],
      [5, 3, 6],
    ]);
  });

  it('Rastgele modda 2. turu puana bakmadan kurar', () => {
    const next = planNextRound(
      rules({ pairingMode: PairingMode.RANDOM }),
      ids(6),
      leagueRound1,
      noShuffle,
    );
    // Masa üyeleri önemli, masadaki oturma sırası değil
    expect(
      next?.tables.map((t) => [...t.participantIds].sort((x, y) => x - y)),
    ).toEqual([
      [1, 2, 4],
      [3, 5, 6],
    ]);
  });

  it('sadece Swiss formatında lig turları bitince turnuvayı bitirir', () => {
    expect(
      planNextRound(
        rules({ format: TournamentFormat.LEAGUE, leagueRounds: 1 }),
        ids(6),
        leagueRound1,
        noShuffle,
      ),
    ).toBeNull();
  });

  it('lig turları bitince ilk advanceCount kişiyle elemeye geçer', () => {
    const next = planNextRound(
      rules({ leagueRounds: 1, tableSize: 4 }),
      ids(6),
      leagueRound1,
      noShuffle,
    );
    expect(next).toEqual({
      stage: MatchStage.ELIMINATION,
      round: 1,
      tables: [{ tableNo: 1, participantIds: [1, 4, 2, 5] }],
      byes: [],
    });
  });

  it('eleme masası ayrı verilmişse elemeyi o büyüklükte kurar', () => {
    const next = planNextRound(
      rules({ leagueRounds: 1, eliminationTableSize: 2, advancePerTable: 1 }),
      ids(6),
      leagueRound1,
      noShuffle,
    );
    expect(next?.tables).toEqual([
      { tableNo: 1, participantIds: [1, 5] },
      { tableNo: 2, participantIds: [4, 2] },
    ]);
  });

  it('doğrudan eleme formatında herkesi yılan sırasıyla dağıtır', () => {
    const next = planNextRound(
      rules({ format: TournamentFormat.ELIMINATION, tableSize: 2 }),
      ids(8),
      [],
      noShuffle,
    );
    expect(next?.tables.map((t) => t.participantIds)).toEqual([
      [1, 8],
      [2, 7],
      [3, 6],
      [4, 5],
    ]);
  });

  const eliminationRound1 = [
    table(MatchStage.ELIMINATION, 1, 1, [
      [1, 1, 0],
      [5, 2, 0],
      [4, 3, 0],
      [8, 4, 0],
    ]),
    table(MatchStage.ELIMINATION, 1, 2, [
      [3, 1, 0],
      [2, 2, 0],
      [6, 3, 0],
      [7, 4, 0],
    ]),
  ];
  const eliminationRules = rules({
    format: TournamentFormat.ELIMINATION,
    tableSize: 4,
  });

  it('eleme turunda her masadan çıkanlarla sonraki turu kurar', () => {
    expect(
      planNextRound(eliminationRules, ids(8), eliminationRound1, noShuffle),
    ).toEqual({
      stage: MatchStage.ELIMINATION,
      round: 2,
      tables: [{ tableNo: 1, participantIds: [1, 3, 5, 2] }],
      byes: [],
    });
  });

  it('2 kişilik elemede tek sayıda oyuncuyu bay geçirir, bay geçen üst tura çıkar', () => {
    const elim = rules({
      format: TournamentFormat.ELIMINATION,
      tableSize: 2,
      advancePerTable: 1,
    });
    const first = planNextRound(elim, ids(5), [], noShuffle);
    expect(first?.byes).toHaveLength(1);
    expect(first?.tables.map((t) => t.participantIds.length)).toEqual([2, 2]);

    const [byeId] = first?.byes ?? [];
    const played: MatchState[] = [
      { ...table(MatchStage.ELIMINATION, 1, 0, [[byeId, 0, 0]]), isBye: true },
      ...(first?.tables ?? []).map((t) =>
        table(MatchStage.ELIMINATION, 1, t.tableNo, [
          [t.participantIds[0], 1, 0],
          [t.participantIds[1], 2, 0],
        ]),
      ),
    ];
    const second = planNextRound(elim, ids(5), played, noShuffle);
    // 3 kişi kaldı: 1 masa + 1 bay; bir önceki turda bay geçen tekrar bay geçmez
    expect(second?.tables).toHaveLength(1);
    expect(second?.byes).toHaveLength(1);
    expect(second?.byes).not.toContain(byeId);
    expect(second?.tables[0].participantIds).toContain(byeId);
  });

  it('final masası oynandıysa null döner', () => {
    const final = table(MatchStage.ELIMINATION, 2, 1, [
      [3, 1, 0],
      [1, 2, 0],
      [2, 3, 0],
      [5, 4, 0],
    ]);
    expect(
      planNextRound(
        eliminationRules,
        ids(8),
        [...eliminationRound1, final],
        noShuffle,
      ),
    ).toBeNull();
  });

  describe('3.lük maçı', () => {
    const twoSeat = rules({
      format: TournamentFormat.ELIMINATION,
      tableSize: 2,
      advancePerTable: 1,
      thirdPlaceMatch: true,
    });
    const semiFinal = [
      table(MatchStage.ELIMINATION, 1, 1, [
        [1, 1, 0],
        [4, 2, 0],
      ]),
      table(MatchStage.ELIMINATION, 1, 2, [
        [2, 1, 0],
        [3, 2, 0],
      ]),
    ];

    it('final kurulurken yarı finalde elenenleri 3.lük masasına oturtur', () => {
      expect(planNextRound(twoSeat, ids(4), semiFinal, noShuffle)).toEqual({
        stage: MatchStage.ELIMINATION,
        round: 2,
        tables: [{ tableNo: 1, participantIds: [1, 2] }],
        byes: [],
        thirdPlace: [4, 3],
      });
    });

    it('ayar kapalıysa 3.lük masası kurulmaz', () => {
      const next = planNextRound(
        { ...twoSeat, thirdPlaceMatch: false },
        ids(4),
        semiFinal,
        noShuffle,
      );
      expect(next?.thirdPlace).toBeUndefined();
    });

    it('final ile 3.lük masası oynandıysa turnuva biter', () => {
      const finalRound = [
        table(MatchStage.ELIMINATION, 2, 1, [
          [1, 1, 0],
          [2, 2, 0],
        ]),
        {
          ...table(MatchStage.ELIMINATION, 2, 2, [
            [3, 1, 0],
            [4, 2, 0],
          ]),
          isThirdPlace: true,
        },
      ];
      expect(
        planNextRound(
          twoSeat,
          ids(4),
          [...semiFinal, ...finalRound],
          noShuffle,
        ),
      ).toBeNull();
    });
  });

  it('turnuvadan çıkarılan oyuncuyu sonraki eleme turuna almaz', () => {
    const activeWithout1 = ids(8).filter((id) => id !== 1);
    const next = planNextRound(
      eliminationRules,
      activeWithout1,
      eliminationRound1,
      noShuffle,
    );
    const seated = next?.tables.flatMap((t) => t.participantIds) ?? [];
    expect(seated).not.toContain(1);
  });

  it('masadan herkes çıkacaksa her masadan en az bir kişi elenir', () => {
    const next = planNextRound(
      { ...eliminationRules, advancePerTable: 4 },
      ids(8),
      eliminationRound1,
      noShuffle,
    );
    const seated = next?.tables.flatMap((t) => t.participantIds) ?? [];
    expect(seated).toHaveLength(6);
  });

  it('yeterli katılımcı yoksa hata verir', () => {
    expect(() => planNextRound(rules(), ids(2), [], noShuffle)).toThrow(
      new FixtureError('NOT_ENOUGH_PARTICIPANTS'),
    );
  });
});
