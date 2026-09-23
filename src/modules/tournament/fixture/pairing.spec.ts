import { countRematches, pairRound, selectByes } from './pairing';

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
