import { rankTable } from './ranking';

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
