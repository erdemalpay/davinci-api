import { computeStandings } from './standings';

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
