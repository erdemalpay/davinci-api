import { computeConsumerStats, hIndex, StatsResult } from './consumerStats';

const catan = { _id: 1, name: 'Catan' };
const azul = { _id: 2, name: 'Azul' };

const result = (
  game: StatsResult['game'],
  players: [number | undefined, string, boolean][],
): StatsResult => ({
  game,
  players: players.map(([consumer, name, isWinner]) => ({
    consumer,
    name,
    isWinner,
  })),
});

describe('hIndex', () => {
  it('h oyunun her biri en az h kez oynandığında h olur', () => {
    expect(hIndex([])).toBe(0);
    expect(hIndex([1])).toBe(1);
    expect(hIndex([5, 3, 2, 1])).toBe(2);
    expect(hIndex([3, 3, 3])).toBe(3);
  });
});

describe('computeConsumerStats', () => {
  const results = [
    result(catan, [
      [7, 'Ali', true],
      [9, 'Ayşe', false],
      [undefined, 'Misafir', false],
    ]),
    result(catan, [
      [7, 'Ali', false],
      [9, 'Ayşe', true],
    ]),
    result(azul, [
      [7, 'Ali', true],
      [9, 'Ayşe', true],
    ]),
  ];

  it('oyun, galibiyet ve oranı sayar', () => {
    const stats = computeConsumerStats(7, results);
    expect(stats.totalPlays).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.winRate).toBe(67);
    expect(stats.distinctGames).toBe(2);
    expect(stats.hIndex).toBe(1);
  });

  it('en çok oynanan oyunları sıralar', () => {
    const stats = computeConsumerStats(7, results);
    expect(stats.mostPlayedGames).toEqual([
      { game: catan, plays: 2, wins: 1 },
      { game: azul, plays: 1, wins: 1 },
    ]);
  });

  it('rakipleri uygulama kullanıcılarından çıkarır, beraberliği saymaz', () => {
    const stats = computeConsumerStats(7, results);
    expect(stats.opponents).toEqual([
      { consumer: 9, name: 'Ayşe', plays: 3, wins: 1, losses: 1 },
    ]);
  });

  it('oynamadığı sonuçları atlar', () => {
    expect(computeConsumerStats(5, results).totalPlays).toBe(0);
    expect(computeConsumerStats(5, results).winRate).toBe(0);
  });
});
