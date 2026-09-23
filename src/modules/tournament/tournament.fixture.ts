export interface TableAssignment {
  tableNo: number;
  participantIds: number[];
}

export interface RoundPairing {
  tables: TableAssignment[];
  byes: number[];
}

export interface TableScore {
  participantId: number;
  score: number;
}

export interface RankedTableEntry extends TableScore {
  rank: number;
  points: number;
}

export interface PlayedMatch {
  isBye: boolean;
  players: { participantId: number; points: number }[];
}

export interface StandingRow {
  participantId: number;
  rank: number;
  points: number;
  matchesPlayed: number;
  byeCount: number;
  avgOpponentPoints: number;
}

// Masaları olabildiğince eşit dağıtır; en küçük masa minimumun altına düşerse
// tam dolu masalar kurulur ve artan oyuncular bay geçer.
export function planTableSizes(
  playerCount: number,
  tableSize: number,
  minTableSize: number,
): { sizes: number[]; byeCount: number } {
  if (playerCount < minTableSize) return { sizes: [], byeCount: playerCount };

  const tableCount = Math.ceil(playerCount / tableSize);
  const base = Math.floor(playerCount / tableCount);
  if (base >= minTableSize) {
    const extra = playerCount % tableCount;
    return {
      sizes: Array.from(
        { length: tableCount },
        (_, i) => base + (i < extra ? 1 : 0),
      ),
      byeCount: 0,
    };
  }

  const fullTables = Math.floor(playerCount / tableSize);
  return {
    sizes: Array(fullTables).fill(tableSize),
    byeCount: playerCount - fullTables * tableSize,
  };
}

export function shuffle<T>(
  items: T[],
  random: () => number = Math.random,
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface PairRoundInput {
  rankedIds: number[]; // en iyiden en kötüye; 1. turda karıştırılmış liste
  tableSize: number;
  minTableSize: number;
  previousOpponents: Map<number, Set<number>>;
  previousByes: Set<number>;
}

export function selectByes(
  rankedIds: number[],
  byeCount: number,
  previousByes: Set<number>,
): number[] {
  const fromBottom = [...rankedIds].reverse();
  const fresh = fromBottom.filter((id) => !previousByes.has(id));
  const repeated = fromBottom.filter((id) => previousByes.has(id));
  return [...fresh, ...repeated].slice(0, byeCount);
}

export function countRematches(
  ids: number[],
  previousOpponents: Map<number, Set<number>>,
): number {
  let count = 0;
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      if (previousOpponents.get(ids[i])?.has(ids[j])) count++;
  return count;
}

// Komşu masalar arasında tek oyuncu takaslayarak tekrar eşleşmeleri azaltır.
// Sadece komşu masalarla takas yapılır ki puan sırası bozulmasın.
function reduceRematches(
  tables: number[][],
  previousOpponents: Map<number, Set<number>>,
) {
  let improved = true;
  let guard = 0;
  while (improved && guard < 100) {
    improved = false;
    guard++;
    for (let t = 0; t < tables.length - 1; t++) {
      const a = tables[t];
      const b = tables[t + 1];
      const before =
        countRematches(a, previousOpponents) +
        countRematches(b, previousOpponents);
      if (before === 0) continue;
      search: for (let i = a.length - 1; i >= 0; i--) {
        for (let j = 0; j < b.length; j++) {
          const nextA = [...a];
          const nextB = [...b];
          [nextA[i], nextB[j]] = [nextB[j], nextA[i]];
          const after =
            countRematches(nextA, previousOpponents) +
            countRematches(nextB, previousOpponents);
          if (after < before) {
            tables[t] = nextA;
            tables[t + 1] = nextB;
            improved = true;
            break search;
          }
        }
      }
    }
  }
}

export function pairRound(input: PairRoundInput): RoundPairing {
  const { sizes, byeCount } = planTableSizes(
    input.rankedIds.length,
    input.tableSize,
    input.minTableSize,
  );
  const byes = selectByes(input.rankedIds, byeCount, input.previousByes);
  const byeSet = new Set(byes);
  const seated = input.rankedIds.filter((id) => !byeSet.has(id));

  const tables: number[][] = [];
  let cursor = 0;
  for (const size of sizes) {
    tables.push(seated.slice(cursor, cursor + size));
    cursor += size;
  }
  reduceRematches(tables, input.previousOpponents);

  return {
    tables: tables.map((participantIds, i) => ({
      tableNo: i + 1,
      participantIds,
    })),
    byes,
  };
}

// Aynı skor aynı sırayı alır (50, 50, 5 → 1., 1., 3.).
export function rankTable(
  scores: TableScore[],
  placementPoints: number[],
): RankedTableEntry[] {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  return sorted.map((entry) => {
    const rank = sorted.findIndex((other) => other.score === entry.score) + 1;
    return { ...entry, rank, points: placementPoints[rank - 1] ?? 0 };
  });
}

// Sıralama: toplam puan → rakiplerin ortalama puanı (BGA'daki gibi) → id.
export function computeStandings(
  participantIds: number[],
  matches: PlayedMatch[],
): StandingRow[] {
  const rows = new Map(
    participantIds.map((id) => [
      id,
      {
        participantId: id,
        points: 0,
        matchesPlayed: 0,
        byeCount: 0,
        opponents: [] as number[],
      },
    ]),
  );

  for (const match of matches) {
    for (const player of match.players) {
      const row = rows.get(player.participantId);
      if (!row) continue;
      row.points += player.points;
      if (match.isBye) {
        row.byeCount++;
        continue;
      }
      row.matchesPlayed++;
      row.opponents.push(
        ...match.players
          .filter((p) => p.participantId !== player.participantId)
          .map((p) => p.participantId),
      );
    }
  }

  const result = [...rows.values()].map((row) => {
    const opponentPoints = row.opponents.map((id) => rows.get(id)?.points ?? 0);
    const avg = opponentPoints.length
      ? opponentPoints.reduce((sum, v) => sum + v, 0) / opponentPoints.length
      : 0;
    return {
      participantId: row.participantId,
      points: row.points,
      matchesPlayed: row.matchesPlayed,
      byeCount: row.byeCount,
      avgOpponentPoints: Math.round(avg * 100) / 100,
    };
  });

  result.sort(
    (a, b) =>
      b.points - a.points ||
      b.avgOpponentPoints - a.avgOpponentPoints ||
      a.participantId - b.participantId,
  );
  return result.map((row, i) => ({ ...row, rank: i + 1 }));
}

// Güçlü oyuncuları masalara yayar: 8 kişi / 2 masa → 1-4-5-8 ve 2-3-6-7.
export function seedEliminationTables(
  rankedIds: number[],
  tableSize: number,
): TableAssignment[] {
  if (rankedIds.length < 2) return [];
  const { sizes } = planTableSizes(rankedIds.length, tableSize, 2);
  const tables: number[][] = sizes.map(() => []);

  const snake: number[] = [];
  while (snake.length < rankedIds.length * 2) {
    for (let i = 0; i < sizes.length; i++) snake.push(i);
    for (let i = sizes.length - 1; i >= 0; i--) snake.push(i);
  }

  let cursor = 0;
  for (const id of rankedIds) {
    while (tables[snake[cursor]].length >= sizes[snake[cursor]]) cursor++;
    tables[snake[cursor]].push(id);
    cursor++;
  }

  return tables.map((participantIds, i) => ({
    tableNo: i + 1,
    participantIds,
  }));
}

// Her masadan ilk `advancePerTable` kişi çıkar; sıra: tüm birinciler, sonra ikinciler...
// Bu sıra bir sonraki turun yılan dağıtımında seed olarak kullanılır.
export function pickAdvancers(
  rankedTables: RankedTableEntry[][],
  advancePerTable: number,
): number[] {
  const result: number[] = [];
  for (let place = 0; place < advancePerTable; place++)
    for (const table of rankedTables) {
      const entry = table[place];
      if (entry) result.push(entry.participantId);
    }
  return result;
}
