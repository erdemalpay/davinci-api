import { pickAdvancers, seedEliminationTables } from './elimination';

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
