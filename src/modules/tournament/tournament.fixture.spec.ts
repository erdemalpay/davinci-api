import {
  applyTieBreak,
  computeFinalRanking,
  computeStandings,
  countRematches,
  findCutTie,
  findTieAfter,
  pairRound,
  pickAdvancers,
  planTableSizes,
  rankTable,
  roundResults,
  seedEliminationTables,
  selectByes,
  Tiebreaker,
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

// [id, skor, masa sırası]; puan Catan'daki gibi galibiyet (1. olan 1, diğerleri 0)
const game = (...players: [number, number, number][]) => ({
  isBye: false,
  players: players.map(([participantId, score, rank]) => ({
    participantId,
    score,
    rank,
    points: rank === 1 ? 1 : 0,
  })),
});

describe('computeStandings (oyun skoruyla eşitlik bozma)', () => {
  const options = { tiebreaker: Tiebreaker.SCORE, scoreCap: 10, tableSize: 4 };
  const order = (rows: { participantId: number }[]) =>
    rows.map((r) => r.participantId);

  it('galibiyet eşitse toplam skora bakar, sınırı aşan skoru sınırdan sayar', () => {
    const result = computeStandings(
      [1, 2, 3, 4],
      [
        game([1, 12, 1], [3, 9, 2]),
        game([2, 10, 1], [4, 9, 2]),
        game([1, 6, 2], [3, 10, 1]),
        game([2, 7, 2], [4, 10, 1]),
      ],
      options,
    );
    // 1: 10 (12 sınırlanır) + 6 = 16, 2: 10 + 7 = 17; 3 ve 4: 19
    expect(order(result)).toEqual([3, 4, 2, 1]);
    expect(result.find((r) => r.participantId === 1)?.totalScore).toBe(16);
  });

  it('toplam skor da eşitse masadaki payların toplamına bakar', () => {
    const result = computeStandings(
      [1, 2],
      [
        game([1, 10, 1], [3, 9, 2], [4, 9, 3], [5, 8, 4]), // 10/36
        game([2, 10, 1], [6, 5, 2], [7, 5, 3], [8, 5, 4]), // 10/25
      ],
      options,
    );
    expect(order(result)).toEqual([2, 1]);
    expect(result.map((r) => r.scoreShare)).toEqual([40, 27.78]);
  });

  it('3 kişilik masada diğerlerinin ortalaması kadar sanal 4. oyuncu sayar', () => {
    const result = computeStandings(
      [1],
      [game([1, 10, 1], [2, 5, 3], [3, 6, 2])],
      options,
    );
    // ortalama 7 → masa toplamı 28; 10/28
    expect(result[0].scoreShare).toBe(35.71);
  });

  it('pay da eşitse daha çok 2.lik, sonra 3.lük yapanı öne alır', () => {
    const result = computeStandings(
      [3, 6],
      [
        game([1, 10, 1], [3, 8, 2], [4, 8, 3], [5, 4, 4]),
        game([2, 10, 1], [7, 8, 2], [6, 8, 3], [8, 4, 4]),
      ],
      options,
    );
    expect(order(result)).toEqual([3, 6]);
  });

  it('her ölçüt eşitse kura numarasına bakar; numara yoksa kimliğe', () => {
    const games = [
      game([1, 10, 1], [3, 5, 2], [4, 5, 3], [5, 5, 4]),
      game([2, 10, 1], [6, 5, 2], [7, 5, 3], [8, 5, 4]),
    ];
    expect(order(computeStandings([1, 2], games, options))).toEqual([1, 2]);
    const lotNumbers = new Map([
      [1, 9],
      [2, 3],
    ]);
    expect(
      order(computeStandings([1, 2], games, { ...options, lotNumbers })),
    ).toEqual([2, 1]);
  });

  it('kura numarası ölçütlerden önce gelmez, sadece son eşitliği bozar', () => {
    const lotNumbers = new Map([
      [1, 1],
      [2, 2],
    ]);
    const result = computeStandings(
      [1, 2],
      [game([2, 10, 1], [3, 5, 2]), game([1, 4, 1], [4, 3, 2])],
      { ...options, lotNumbers },
    );
    // 2: 10 skor, 1: 4 skor; numaraya değil skora bakılır
    expect(order(result)).toEqual([2, 1]);
  });

  it('bay geçen sınır kadar skor alır, payı yoktur', () => {
    const result = computeStandings(
      [1],
      [{ isBye: true, players: [{ participantId: 1, points: 1 }] }],
      options,
    );
    expect(result[0]).toMatchObject({ totalScore: 10, scoreShare: 0 });
  });

  it('varsayılan eşitlik bozmada skor alanlarını eklemez', () => {
    const [row] = computeStandings([1], [game([1, 10, 1], [2, 5, 2])]);
    expect(row).not.toHaveProperty('totalScore');
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

  it('3.lük masasındakiler finalistlerin arkasından masa sırasıyla gelir', () => {
    const result = computeFinalRanking(league([1, 2, 3, 4, 5]), [
      table(1, [
        [1, 1],
        [4, 2],
      ]),
      table(1, [
        [2, 1],
        [3, 2],
      ]),
      table(2, [
        [2, 1],
        [1, 2],
      ]),
      {
        ...table(2, [
          [4, 1],
          [3, 2],
        ]),
        isThirdPlace: true,
      },
    ]);
    expect(result.map((r) => r.participantId)).toEqual([2, 1, 4, 3, 5]);
    expect(result[2].elimination).toEqual({
      round: 2,
      isFinal: false,
      isThirdPlace: true,
      tableRank: 1,
    });
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

  it('puan turu yoksa aynı turda aynı sırayla elenenler sırayı paylaşır', () => {
    // 7 kişilik 2'lik eleme: çeyrek final (3 masa + bay), yarı final, final
    const result = computeFinalRanking(
      league([1, 2, 3, 4, 5, 6, 7]),
      [
        table(1, [
          [1, 1],
          [5, 2],
        ]),
        table(1, [
          [2, 1],
          [6, 2],
        ]),
        table(1, [
          [3, 1],
          [7, 2],
        ]),
        table(1, [[4]]),
        table(2, [
          [1, 1],
          [4, 2],
        ]),
        table(2, [
          [2, 1],
          [3, 2],
        ]),
        table(3, [
          [2, 1],
          [1, 2],
        ]),
      ],
      { shareTies: true, advancePerTable: 1 },
    );
    expect(result.map((r) => [r.participantId, r.rank])).toEqual([
      [2, 1],
      [1, 2],
      [3, 3],
      [4, 3],
      [5, 5],
      [6, 5],
      [7, 5],
    ]);
  });

  it('tur oynanırken masası bitmeyenler çıkanlarla elenenlerin arasında durur', () => {
    const result = computeFinalRanking(
      league([1, 2, 3, 4, 5, 6]),
      [
        table(1, [
          [5, 1],
          [1, 2],
        ]),
        table(1, [[2], [6]], false),
        table(1, [[3], [4]], false),
      ],
      { shareTies: true, advancePerTable: 1 },
    );
    expect(result.map((r) => [r.participantId, r.rank])).toEqual([
      [5, 1],
      [2, 2],
      [3, 2],
      [4, 2],
      [6, 2],
      [1, 6],
    ]);
  });

  it('bay geçen, masasını kazananlarla aynı sırayı paylaşır', () => {
    const result = computeFinalRanking(
      league([1, 2, 3]),
      [
        table(1, [
          [1, 1],
          [3, 2],
        ]),
        { ...table(1, [[2]]), isBye: true },
      ],
      { shareTies: true, advancePerTable: 1 },
    );
    expect(result.map((r) => [r.participantId, r.rank])).toEqual([
      [1, 1],
      [2, 1],
      [3, 3],
    ]);
  });

  it('beraberlik kararı bekleyen masa sonuçlanmamış sayılır', () => {
    const result = computeFinalRanking(league([1, 2]), [
      {
        ...table(1, [
          [1, 1],
          [2, 1],
        ]),
        pendingTie: { participantIds: [1, 2], slots: 1 },
      },
    ]);
    expect(result.map((r) => r.elimination?.tableRank)).toEqual([
      undefined,
      undefined,
    ]);
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

describe('computeFinalRanking (yarı final sonrası güncel sıralama)', () => {
  const league = (ids: number[]) =>
    ids.map((participantId, i) => ({
      participantId,
      rank: i + 1,
      points: 0,
      matchesPlayed: 0,
      byeCount: 0,
      avgOpponentPoints: 0,
    }));
  const table = (round: number, players: [number, number][]) => ({
    round,
    isCompleted: true,
    players: players.map(([participantId, rank]) => ({ participantId, rank })),
  });
  const semifinals = [
    table(1, [
      [1, 1],
      [3, 2],
      [5, 3],
    ]),
    table(1, [
      [2, 1],
      [4, 2],
      [6, 3],
    ]),
  ];
  // yarı final sonuçları eklenmiş güncel sıralama (resmi kural 1.3.4)
  const updated = new Map([
    [1, 1],
    [2, 2],
    [6, 3],
    [3, 4],
    [4, 5],
    [5, 6],
  ]);

  it('güncel sıralama verilmezse masadaki sıraya, sonra lig sırasına göre dizer', () => {
    const result = computeFinalRanking(league([1, 2, 3, 4, 5, 6]), semifinals, {
      advancePerTable: 1,
    });
    expect(result.map((r) => r.participantId)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('elenenleri güncel sıralamaya göre dizer, yarı final kazananları üstte kalır', () => {
    const result = computeFinalRanking(league([1, 2, 3, 4, 5, 6]), semifinals, {
      advancePerTable: 1,
      eliminationOrder: updated,
    });
    expect(result.map((r) => r.participantId)).toEqual([1, 2, 6, 3, 4, 5]);
  });

  it('güncel sıralamada daha geride olan kazanan, elenenlerin üstünde kalır', () => {
    const lowWinner = new Map([
      [1, 6],
      [2, 1],
      [3, 2],
      [4, 3],
      [5, 4],
      [6, 5],
    ]);
    const result = computeFinalRanking(league([1, 2, 3, 4, 5, 6]), semifinals, {
      advancePerTable: 1,
      eliminationOrder: lowWinner,
    });
    expect(result.slice(0, 2).map((r) => r.participantId)).toEqual([2, 1]);
  });

  it('final oynandıysa ilk dörtte final masasındaki sıra, sonra güncel sıralama gelir', () => {
    const result = computeFinalRanking(
      league([1, 2, 3, 4, 5, 6]),
      [
        ...semifinals,
        table(2, [
          [1, 2],
          [2, 1],
        ]),
      ],
      { advancePerTable: 1, eliminationOrder: updated },
    );
    expect(result.map((r) => r.participantId)).toEqual([2, 1, 6, 3, 4, 5]);
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

describe('findTieAfter', () => {
  const ranked = (scores: number[]) =>
    rankTable(
      scores.map((score, i) => ({ participantId: i + 1, score })),
      [4, 2, 1, 0],
    );

  it('verilen sıradan sonraki ilk eşitliği tek kişilik seçim olarak döner', () => {
    expect(findTieAfter(ranked([60, 60, 50, 50]), 0, [4, 2, 1, 0])).toEqual({
      participantIds: [1, 2],
      slots: 1,
    });
    expect(findTieAfter(ranked([60, 60, 50, 50]), 1, [4, 2, 1, 0])).toEqual({
      participantIds: [3, 4],
      slots: 1,
    });
  });

  it('eşitlik yoksa ya da hepsi verilen sıradaysa karar gerekmez', () => {
    expect(findTieAfter(ranked([60, 50, 40, 30]), 0, [4, 2, 1, 0])).toBeNull();
    expect(findTieAfter(ranked([60, 60, 40, 30]), 1, [4, 2, 1, 0])).toBeNull();
  });

  it('eşitler hangi sırada olursa olsun aynı puanı alıyorsa karar gerekmez', () => {
    expect(findTieAfter(ranked([10, 4, 4, 2]), 0, [1, 0, 0, 0])).toBeNull();
    expect(findTieAfter(ranked([10, 10, 4, 2]), 0, [1, 0, 0, 0])).toEqual({
      participantIds: [1, 2],
      slots: 1,
    });
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

describe('roundResults (tur payı)', () => {
  const options = { tiebreaker: Tiebreaker.SCORE, scoreCap: 10, tableSize: 4 };

  it('tur paylarının toplamı puan tablosundaki % ile aynıdır', () => {
    const matches = [
      { round: 1, ...game([1, 10, 1], [2, 5, 3], [3, 6, 2]) },
      { round: 2, ...game([1, 9, 2], [2, 10, 1], [3, 4, 3], [4, 8, 4]) },
      { round: 3, ...game([1, 10, 1], [2, 7, 2], [3, 7, 3], [4, 6, 4]) },
    ];
    const rounds = roundResults(matches, options).get(1);
    // 1. tur 3 kişilik masa: ortalama 7 → toplam 28 → 10/28
    expect(rounds?.map((r) => r.share)).toEqual([35.71, 29.03, 33.33]);
    const [row] = computeStandings([1], matches, options);
    const sum = rounds?.reduce((total, r) => total + (r.share ?? 0), 0) ?? 0;
    expect(Math.abs(sum - row.scoreShare)).toBeLessThan(0.02);
  });

  it('varsayılan eşitlik bozmada pay eklenmez', () => {
    const rounds = roundResults([
      { round: 1, ...game([1, 10, 1], [2, 5, 2]) },
    ]).get(1);
    expect(rounds?.[0]).not.toHaveProperty('share');
  });

  it('bay geçilen turda pay yoktur', () => {
    const rounds = roundResults(
      [{ round: 1, isBye: true, players: [{ participantId: 1, points: 1 }] }],
      options,
    ).get(1);
    expect(rounds?.[0]).not.toHaveProperty('share');
  });
});
