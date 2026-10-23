import { GameplayResultPlayer } from './consumerApp.schema';

export interface StatsGame {
  _id: number;
  name: string;
  thumbnail?: string;
}

export interface StatsResult {
  game: StatsGame;
  players: GameplayResultPlayer[];
}

export interface ConsumerStats {
  totalPlays: number;
  wins: number;
  // 0–100, rounded.
  winRate: number;
  distinctGames: number;
  // The largest h such that h games were played at least h times each.
  hIndex: number;
  mostPlayedGames: { game: StatsGame; plays: number; wins: number }[];
  // Other app users played with: games together, and who won them.
  opponents: {
    consumer: number;
    name: string;
    plays: number;
    wins: number;
    losses: number;
  }[];
}

const TOP_COUNT = 5;

export function hIndex(playCounts: number[]) {
  const sorted = [...playCounts].sort((a, b) => b - a);
  let h = 0;
  while (h < sorted.length && sorted[h] >= h + 1) h++;
  return h;
}

// The consumer's statistics from the results they played in.
export function computeConsumerStats(
  consumerId: number,
  results: StatsResult[],
): ConsumerStats {
  const games = new Map<
    number,
    { game: StatsGame; plays: number; wins: number }
  >();
  const opponents = new Map<
    number,
    {
      consumer: number;
      name: string;
      plays: number;
      wins: number;
      losses: number;
    }
  >();
  let totalPlays = 0;
  let wins = 0;

  for (const result of results) {
    const me = result.players.find((player) => player.consumer === consumerId);
    if (!me || !result.game) continue;
    totalPlays++;
    if (me.isWinner) wins++;

    const gameStats = games.get(result.game._id) ?? {
      game: result.game,
      plays: 0,
      wins: 0,
    };
    gameStats.plays++;
    if (me.isWinner) gameStats.wins++;
    games.set(result.game._id, gameStats);

    for (const other of result.players) {
      if (!other.consumer || other.consumer === consumerId) continue;
      const opponent = opponents.get(other.consumer) ?? {
        consumer: other.consumer,
        name: other.name,
        plays: 0,
        wins: 0,
        losses: 0,
      };
      opponent.plays++;
      if (me.isWinner && !other.isWinner) opponent.wins++;
      if (other.isWinner && !me.isWinner) opponent.losses++;
      opponents.set(other.consumer, opponent);
    }
  }

  const byPlays = <T extends { plays: number }>(a: T, b: T) =>
    b.plays - a.plays;
  const gameStats = [...games.values()];
  return {
    totalPlays,
    wins,
    winRate: totalPlays ? Math.round((wins / totalPlays) * 100) : 0,
    distinctGames: gameStats.length,
    hIndex: hIndex(gameStats.map((game) => game.plays)),
    mostPlayedGames: gameStats.sort(byPlays).slice(0, TOP_COUNT),
    opponents: [...opponents.values()].sort(byPlays).slice(0, TOP_COUNT),
  };
}
