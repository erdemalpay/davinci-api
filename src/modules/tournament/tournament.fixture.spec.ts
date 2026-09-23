import {
  computeStandings,
  countRematches,
  pairRound,
  pickAdvancers,
  planTableSizes,
  rankTable,
  seedEliminationTables,
  selectByes,
} from './tournament.fixture';

describe('planTableSizes', () => {
  it.each([
    [15, 4, 2, [4, 4, 4, 3], 0],
    [12, 3, 2, [3, 3, 3, 3], 0],
    [13, 3, 2, [3, 3, 3, 2, 2], 0],
    [13, 3, 3, [3, 3, 3, 3], 1],
    [13, 4, 3, [4, 3, 3, 3], 0],
    [5, 4, 3, [4], 1],
    [2, 4, 3, [], 2],
  ])(
    '%i oyuncu, %i kişilik masa, en az %i → %j + %i bay',
    (players, tableSize, minTableSize, sizes, byeCount) => {
      expect(planTableSizes(players, tableSize, minTableSize)).toEqual({
        sizes,
        byeCount,
      });
    },
  );
});

const played = (...groups: number[][]) => {
  const map = new Map<number, Set<number>>();
  for (const group of groups)
    for (const a of group)
      for (const b of group)
        if (a !== b) map.set(a, (map.get(a) ?? new Set()).add(b));
  return map;
};

describe('selectByes', () => {
  it('sıralamada en alttakini seçer', () => {
    expect(selectByes([1, 2, 3, 4], 1, new Set())).toEqual([4]);
  });

  it('daha önce bay geçeni atlar', () => {
    expect(selectByes([1, 2, 3, 4], 1, new Set([4]))).toEqual([3]);
  });

  it('herkes bay geçtiyse yine en alttakini seçer', () => {
    expect(selectByes([1, 2], 1, new Set([1, 2]))).toEqual([2]);
  });
});

describe('pairRound', () => {
  it('sıralamaya göre sırayla masalara oturtur', () => {
    const result = pairRound({
      rankedIds: [1, 2, 3, 4, 5, 6, 7],
      tableSize: 4,
      minTableSize: 2,
      previousOpponents: new Map(),
      previousByes: new Set(),
    });
    expect(result).toEqual({
      tables: [
        { tableNo: 1, participantIds: [1, 2, 3, 4] },
        { tableNo: 2, participantIds: [5, 6, 7] },
      ],
      byes: [],
    });
  });

  it('masa kurulamayan oyuncuyu bay geçirir', () => {
    const result = pairRound({
      rankedIds: [1, 2, 3, 4, 5, 6, 7],
      tableSize: 3,
      minTableSize: 3,
      previousOpponents: new Map(),
      previousByes: new Set(),
    });
    expect(result.byes).toEqual([7]);
    expect(result.tables.map((t) => t.participantIds)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it('tekrar eşleşmeyi mümkün olan en aza indirir', () => {
    const previousOpponents = played([1, 2, 3]);
    const result = pairRound({
      rankedIds: [1, 2, 3, 4, 5, 6],
      tableSize: 3,
      minTableSize: 3,
      previousOpponents,
      previousByes: new Set(),
    });
    const total = result.tables.reduce(
      (sum, t) => sum + countRematches(t.participantIds, previousOpponents),
      0,
    );
    // 3 kişi 2 masaya bölünürken ikisi mecburen yan yana düşer
    expect(total).toBe(1);
  });
});

describe('rankTable', () => {
  it('skora göre sıralar ve sıranın puanını verir', () => {
    const result = rankTable(
      [
        { participantId: 3, score: 5 },
        { participantId: 1, score: 50 },
        { participantId: 2, score: 30 },
      ],
      [4, 2, 0],
    );
    expect(result).toEqual([
      { participantId: 1, score: 50, rank: 1, points: 4 },
      { participantId: 2, score: 30, rank: 2, points: 2 },
      { participantId: 3, score: 5, rank: 3, points: 0 },
    ]);
  });

  it('eşit skorlulara aynı sırayı ve puanı verir', () => {
    const result = rankTable(
      [
        { participantId: 1, score: 50 },
        { participantId: 2, score: 50 },
        { participantId: 3, score: 5 },
      ],
      [4, 2, 0],
    );
    expect(result.map((r) => [r.rank, r.points])).toEqual([
      [1, 4],
      [1, 4],
      [3, 0],
    ]);
  });

  it('puan listesinde karşılığı olmayan sıraya 0 verir', () => {
    const result = rankTable(
      [1, 2, 3, 4].map((id) => ({ participantId: id, score: 10 - id })),
      [4, 2, 0],
    );
    expect(result[3].points).toBe(0);
  });
});

const match = (...players: [number, number][]) => ({
  isBye: false,
  players: players.map(([participantId, points]) => ({
    participantId,
    points,
  })),
});

describe('computeStandings', () => {
  it('eşit puanda rakip ortalaması yüksek olanı öne alır', () => {
    // 1, 2, 3 dörder puan; 1'in rakibi (2) 4 puanlı, 2'nin rakipleri ort. 2, 3'ün rakibi 0
    const result = computeStandings(
      [1, 2, 3, 4],
      [match([1, 4], [2, 0]), match([3, 4], [4, 0]), match([2, 4], [4, 0])],
    );
    expect(
      result.map((r) => [r.participantId, r.points, r.avgOpponentPoints]),
    ).toEqual([
      [1, 4, 4],
      [2, 4, 2],
      [3, 4, 0],
      [4, 0, 4],
    ]);
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('bay puanını ekler ama maç ve rakip saymaz', () => {
    const result = computeStandings(
      [1, 2, 3],
      [
        match([1, 4], [2, 0]),
        { isBye: true, players: [{ participantId: 3, points: 4 }] },
      ],
    );
    const row = result.find((r) => r.participantId === 3);
    expect(row).toMatchObject({
      points: 4,
      matchesPlayed: 0,
      byeCount: 1,
      avgOpponentPoints: 0,
    });
  });
});

describe('seedEliminationTables', () => {
  it('8 kişiyi 4 kişilik masalara yılan sırasıyla dağıtır', () => {
    expect(seedEliminationTables([1, 2, 3, 4, 5, 6, 7, 8], 4)).toEqual([
      { tableNo: 1, participantIds: [1, 4, 5, 8] },
      { tableNo: 2, participantIds: [2, 3, 6, 7] },
    ]);
  });

  it('2 kişilik oyunda klasik çeyrek final eşleşmesi kurar', () => {
    expect(
      seedEliminationTables([1, 2, 3, 4, 5, 6, 7, 8], 2).map(
        (t) => t.participantIds,
      ),
    ).toEqual([
      [1, 8],
      [2, 7],
      [3, 6],
      [4, 5],
    ]);
  });

  it('masa sayısı kadar oyuncu yoksa tek final masası kurar', () => {
    expect(seedEliminationTables([1, 2, 3, 4], 4)).toEqual([
      { tableNo: 1, participantIds: [1, 2, 3, 4] },
    ]);
  });
});

describe('pickAdvancers', () => {
  it('önce masa birincilerini, sonra ikincilerini sıralar', () => {
    const entry = (participantId: number, rank: number) => ({
      participantId,
      score: 0,
      rank,
      points: 0,
    });
    const result = pickAdvancers(
      [
        [entry(1, 1), entry(5, 2), entry(4, 3), entry(8, 4)],
        [entry(3, 1), entry(2, 2), entry(6, 3), entry(7, 4)],
      ],
      2,
    );
    expect(result).toEqual([1, 3, 5, 2]);
  });
});
