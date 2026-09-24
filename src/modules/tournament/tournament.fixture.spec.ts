import {
  applyTieBreak,
  computeFinalRanking,
  computeStandings,
  countRematches,
  findCutTie,
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

  // #13 numaralı demo turnuvasının 3. turu: 2. turda 1. masada oturan dört lider
  // (1, 2, 3, 4) puan sırasıyla kesilince yine aynı masalara düşüyordu.
  it('önceki masadaki liderleri yeni masalara dağıtarak tekrarı önler', () => {
    const met = (groups: number[][]) => {
      const map = new Map<number, Set<number>>();
      groups.forEach((g) =>
        g.forEach((a) =>
          g.forEach((b) => {
            if (a !== b) map.set(a, (map.get(a) ?? new Set()).add(b));
          }),
        ),
      );
      return map;
    };
    const previousOpponents = met([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
    const input = {
      rankedIds: [1, 5, 2, 6, 3, 7, 4, 8],
      tableSize: 4,
      minTableSize: 3,
      previousOpponents,
      previousByes: new Set<number>(),
    };
    const { tables } = pairRound(input);
    expect(
      tables.reduce(
        (sum, t) => sum + countRematches(t.participantIds, previousOpponents),
        0,
      ),
    ).toBe(4); // 8 kişi, 2 masa: en iyisi her masada iki gruptan ikişer kişi

    // 12 kişi önceki turda 4 masada 3'er kişi oynamış; puan sırasıyla kesilseydi
    // her yeni masada eski rakipler olurdu, her masaya her gruptan biri düşebilir.
    const threes = met([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
    ]);
    const bigger = pairRound({
      ...input,
      rankedIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      previousOpponents: threes,
    });
    expect(
      bigger.tables.reduce(
        (sum, t) => sum + countRematches(t.participantIds, threes),
        0,
      ),
    ).toBe(0);
    expect(bigger.tables[0].participantIds[0]).toBe(1); // lider 1. masada kalır
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
    expect(seedEliminationTables([1, 2, 3, 4, 5, 6, 7, 8], 4)).toEqual({
      tables: [
        { tableNo: 1, participantIds: [1, 4, 5, 8] },
        { tableNo: 2, participantIds: [2, 3, 6, 7] },
      ],
      byes: [],
    });
  });

  it('2 kişilik oyunda klasik çeyrek final eşleşmesi kurar', () => {
    expect(
      seedEliminationTables([1, 2, 3, 4, 5, 6, 7, 8], 2).tables.map(
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
    expect(seedEliminationTables([1, 2, 3, 4], 4)).toEqual({
      tables: [{ tableNo: 1, participantIds: [1, 2, 3, 4] }],
      byes: [],
    });
  });

  it('2 kişilik oyunda tek sayıda oyuncu varsa en üst sıradaki bay geçer', () => {
    expect(seedEliminationTables([1, 2, 3, 4, 5], 2)).toEqual({
      tables: [
        { tableNo: 1, participantIds: [2, 5] },
        { tableNo: 2, participantIds: [3, 4] },
      ],
      byes: [1],
    });
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

  it('küçük kalan masada herkesi çıkarmaz, bay masasındakini çıkarır', () => {
    const entry = (participantId: number, rank: number) => ({
      participantId,
      score: 0,
      rank,
      points: 0,
    });
    // 3'lük oyunda 2 kişilik masalar, masadan 2 kişi çıkacak ayarı
    expect(
      pickAdvancers(
        [[entry(1, 1), entry(4, 2)], [entry(2, 1), entry(3, 2)], [entry(5, 0)]],
        2,
      ),
    ).toEqual([1, 2, 5]);
  });
});

describe('computeFinalRanking', () => {
  const league = (ids: number[]) =>
    ids.map((participantId, i) => ({
      participantId,
      rank: i + 1,
      points: 0,
      matchesPlayed: 0,
      byeCount: 0,
      avgOpponentPoints: 0,
    }));
  const table = (
    round: number,
    players: [number, number?][],
    isCompleted = true,
  ) => ({
    round,
    isCompleted,
    players: players.map(([participantId, rank]) => ({ participantId, rank })),
  });

  it('eleme yoksa lig sıralamasını olduğu gibi döner', () => {
    const standings = league([3, 1, 2]);
    expect(computeFinalRanking(standings, [])).toEqual(standings);
  });

  it('doğrudan elemede finalden başlayıp elendiği tura göre sıralar', () => {
    const result = computeFinalRanking(
      league([29, 30, 31, 32, 33, 34, 35, 36]),
      [
        table(1, [
          [35, 1],
          [31, 2],
          [30, 3],
          [32, 4],
        ]),
        table(1, [
          [34, 1],
          [33, 2],
          [29, 3],
          [36, 4],
        ]),
        table(2, [
          [35, 1],
          [34, 2],
          [33, 3],
          [31, 4],
        ]),
      ],
    );
    expect(result.map((r) => r.participantId)).toEqual([
      35, 34, 33, 31, 29, 30, 32, 36,
    ]);
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result[0].elimination).toEqual({
      round: 2,
      isFinal: true,
      tableRank: 1,
    });
    expect(result[5].elimination).toEqual({
      round: 1,
      isFinal: false,
      tableRank: 3,
    });
  });

  it('elemeye çıkamayanları lig sırasıyla sona ekler', () => {
    const result = computeFinalRanking(league([1, 2, 3, 4, 5, 6]), [
      table(1, [
        [3, 1],
        [1, 2],
        [4, 3],
        [2, 4],
      ]),
    ]);
    expect(result.map((r) => r.participantId)).toEqual([3, 1, 4, 2, 5, 6]);
    expect(result[4].elimination).toBeUndefined();
  });

  it('final henüz oynanmadıysa finalistleri lig sırasıyla üste koyar', () => {
    const result = computeFinalRanking(league([1, 2, 3, 4, 5]), [
      table(1, [[4], [2], [1], [3]], false),
    ]);
    expect(result.map((r) => r.participantId)).toEqual([1, 2, 3, 4, 5]);
    expect(result[0].elimination).toEqual({
      round: 1,
      isFinal: true,
      tableRank: undefined,
    });
  });
});

describe('findCutTie', () => {
  const ranked = (scores: number[]) =>
    rankTable(
      scores.map((score, i) => ({ participantId: i + 1, score })),
      [4, 2, 1, 0],
    );

  it('sınırdaki sıra paylaşılıyorsa eşitleri ve boş yer sayısını döner', () => {
    expect(findCutTie(ranked([60, 50, 50, 40]), 2)).toEqual({
      participantIds: [2, 3],
      slots: 1,
    });
    expect(findCutTie(ranked([60, 60, 60, 40]), 2)).toEqual({
      participantIds: [1, 2, 3],
      slots: 2,
    });
  });

  it('eşitlik sınırın içindeyse ya da herkes çıkıyorsa karar gerekmez', () => {
    expect(findCutTie(ranked([60, 60, 50, 40]), 2)).toBeNull();
    expect(findCutTie(ranked([60, 50, 40, 40]), 2)).toBeNull();
    expect(findCutTie(ranked([50, 50]), 2)).toBeNull();
  });
});

describe('applyTieBreak', () => {
  it('seçilenler sırasını korur, diğer eşitler arkalarına iner', () => {
    const ranked = rankTable(
      [
        { participantId: 1, score: 60 },
        { participantId: 2, score: 50 },
        { participantId: 3, score: 50 },
        { participantId: 4, score: 40 },
      ],
      [4, 2, 1, 0],
    );
    const result = applyTieBreak(ranked, { participantIds: [2, 3], slots: 1 }, [
      3,
    ]);
    expect(result.map((p) => [p.participantId, p.rank])).toEqual([
      [1, 1],
      [3, 2],
      [2, 3],
      [4, 4],
    ]);
    expect(result.find((p) => p.participantId === 3)?.wonTieBreak).toBe(true);
    expect(pickAdvancers([result], 2)).toEqual([1, 3]);
  });
});
