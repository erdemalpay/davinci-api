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
    sizes: new Array(fullTables).fill(tableSize),
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
  random?: () => number; // tekrar kaçınılmazsa takılmamak için rastgele takas
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

const hasMet = (
  a: number,
  b: number,
  previousOpponents: Map<number, Set<number>>,
) => previousOpponents.get(a)?.has(b) ?? false;

// Masaları puan sırasıyla doldurur: her masaya oturmamış en üst oyuncu oturur, kalan
// koltuklara sıradaki oyunculardan masadakilerle daha önce karşılaşmamış olan alınır.
// Uygun kimse yoksa en az tekrar yaratan (eşitse sırada üstte olan) oturur.
function seatAvoidingRematches(
  seated: number[],
  sizes: number[],
  previousOpponents: Map<number, Set<number>>,
): number[][] {
  const remaining = [...seated];
  return sizes.map((size) => {
    const table = [remaining.shift() as number];
    while (table.length < size) {
      let bestIndex = 0;
      let bestConflicts = Infinity;
      for (let i = 0; i < remaining.length && bestConflicts > 0; i++) {
        const conflicts = table.filter((id) =>
          hasMet(id, remaining[i], previousOpponents),
        ).length;
        if (conflicts < bestConflicts) {
          bestConflicts = conflicts;
          bestIndex = i;
        }
      }
      table.push(remaining.splice(bestIndex, 1)[0]);
    }
    return table;
  });
}

// Bir oturma düzeninin maliyeti: önce tekrar sayısı, eşitse puan sırasından sapma
// (oyuncunun oturduğu masa ile puan sırasına göre oturacağı masa arasındaki fark).
function seatingCost(
  tables: number[][],
  rankTableOf: Map<number, number>,
  previousOpponents: Map<number, Set<number>>,
) {
  let rematches = 0;
  let displacement = 0;
  tables.forEach((table, t) => {
    rematches += countRematches(table, previousOpponents);
    table.forEach((id) => {
      displacement += Math.abs(t - (rankTableOf.get(id) ?? t));
    });
  });
  return rematches * 1000 + displacement;
}

// Satranç (FIDE) ve Scrabble (tsh) eşleştiricileri gibi tek seferde doğru masayı bulmak
// yerine, masalar arası oyuncu takaslarıyla maliyeti düşürür. Takılınca rastgele bir
// takasla yerinden oynatıp tekrar dener ve görülen en iyi düzeni döner.
const MAX_IMPROVEMENT_STEPS = 300;

type Seating = { tables: number[][]; cost: number };

const swapPlayers = (
  tables: number[][],
  [t, i]: [number, number],
  [u, j]: [number, number],
) => {
  const next = tables.map((table) => [...table]);
  [next[t][i], next[u][j]] = [next[u][j], next[t][i]];
  return next;
};

// Farklı masalardaki iki oyuncunun yer değiştirdiği tüm düzenler arasından en ucuzu;
// mevcut düzenden ucuzu yoksa null.
function bestSwap(
  current: Seating,
  cost: (tables: number[][]) => number,
): Seating | null {
  let best: Seating | null = null;
  const { tables } = current;
  for (let t = 0; t < tables.length; t++)
    for (let u = t + 1; u < tables.length; u++)
      for (let i = 0; i < tables[t].length; i++)
        for (let j = 0; j < tables[u].length; j++) {
          const next = swapPlayers(tables, [t, i], [u, j]);
          const nextCost = cost(next);
          if (nextCost < (best?.cost ?? current.cost))
            best = { tables: next, cost: nextCost };
        }
  return best;
}

// Yerel en iyide takılınca rastgele iki masadan birer oyuncuyu yer değiştirir
function randomSwap(tables: number[][], random: () => number) {
  const pick = (length: number) => Math.floor(random() * length);
  const t = pick(tables.length);
  const u = pick(tables.length);
  if (t === u) return tables;
  return swapPlayers(
    tables,
    [t, pick(tables[t].length)],
    [u, pick(tables[u].length)],
  );
}

function improveSeating(
  start: number[][],
  rankTableOf: Map<number, number>,
  previousOpponents: Map<number, Set<number>>,
  random: () => number,
): number[][] {
  const cost = (tables: number[][]) =>
    seatingCost(tables, rankTableOf, previousOpponents);
  let current: Seating = { tables: start, cost: cost(start) };
  let best = current;

  for (
    let step = 0;
    step < MAX_IMPROVEMENT_STEPS && best.cost >= 1000;
    step++
  ) {
    const move = bestSwap(current, cost);
    if (move) {
      current = move;
    } else {
      const tables = randomSwap(current.tables, random);
      current = { tables, cost: cost(tables) };
    }
    if (current.cost < best.cost) best = current;
  }
  return best.tables;
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

  // Tekrar önlenmeseydi her oyuncunun puan sırasına göre oturacağı masa
  const rankTableOf = new Map<number, number>();
  let cursor = 0;
  sizes.forEach((size, t) => {
    seated.slice(cursor, cursor + size).forEach((id) => rankTableOf.set(id, t));
    cursor += size;
  });
  const tables = improveSeating(
    seatAvoidingRematches(seated, sizes, input.previousOpponents),
    rankTableOf,
    input.previousOpponents,
    input.random ?? Math.random,
  );

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

export interface PendingTie {
  participantIds: number[];
  slots: number; // eşitlerden kaç kişi çıkacak
}

// Masadan ilk `cut` kişi çıkıyorsa ve sınırdaki sıra paylaşılıyorsa (ör. 2 kişi çıkacak,
// 2. ve 3. aynı skor) kimin çıkacağına organizatör karar vermeli.
export function findCutTie(
  ranked: RankedTableEntry[],
  cut: number,
): PendingTie | null {
  if (cut <= 0 || cut >= ranked.length) return null;
  const boundaryRank = ranked[cut - 1].rank;
  if (ranked[cut].rank !== boundaryRank) return null;
  const tied = ranked.filter((entry) => entry.rank === boundaryRank);
  const ahead = ranked.filter((entry) => entry.rank < boundaryRank).length;
  return {
    participantIds: tied.map((entry) => entry.participantId),
    slots: cut - ahead,
  };
}

// Seçilenler paylaşılan sırada kalır, diğer eşitler seçilenlerin arkasına iner.
export function applyTieBreak<T extends RankedTableEntry>(
  ranked: T[],
  tie: PendingTie,
  winnerIds: number[],
): (T & { wonTieBreak?: boolean })[] {
  const tiedRank = ranked.find(
    (entry) => entry.participantId === tie.participantIds[0],
  )?.rank;
  const reranked = ranked.map((entry) => {
    if (!tie.participantIds.includes(entry.participantId)) return entry;
    return winnerIds.includes(entry.participantId)
      ? { ...entry, wonTieBreak: true }
      : { ...entry, rank: (tiedRank ?? entry.rank) + winnerIds.length };
  });
  return reranked.sort((a, b) => a.rank - b.rank);
}

export interface RoundResult {
  round: number;
  points: number;
  isBye: boolean;
}

// Puan tablosunda tur tur gösterim için her oyuncunun her turda aldığı puan
export function roundResults(
  matches: (PlayedMatch & { round: number })[],
): Map<number, RoundResult[]> {
  const results = new Map<number, RoundResult[]>();
  [...matches]
    .sort((a, b) => a.round - b.round)
    .forEach((match) =>
      match.players.forEach((player) =>
        results.set(player.participantId, [
          ...(results.get(player.participantId) ?? []),
          { round: match.round, points: player.points, isBye: match.isBye },
        ]),
      ),
    );
  return results;
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
// Masaya sığmayan artan oyuncular (2 kişilik oyunda tek sayı) bay geçer; Challonge ve
// BGA'daki gibi bay hakkı en üst sıradakilere verilir; daha önce bay geçen önceliği kaybeder.
export function seedEliminationTables(
  rankedIds: number[],
  tableSize: number,
  previousByes: Set<number> = new Set(),
): RoundPairing {
  if (rankedIds.length < 2) return { tables: [], byes: [] };
  const { sizes, byeCount } = planTableSizes(rankedIds.length, tableSize, 2);
  const byes = [
    ...rankedIds.filter((id) => !previousByes.has(id)),
    ...rankedIds.filter((id) => previousByes.has(id)),
  ].slice(0, byeCount);
  const seated = rankedIds.filter((id) => !byes.includes(id));
  const tables: number[][] = sizes.map(() => []);

  const snake: number[] = [];
  while (snake.length < seated.length * 2) {
    for (let i = 0; i < sizes.length; i++) snake.push(i);
    for (let i = sizes.length - 1; i >= 0; i--) snake.push(i);
  }

  let cursor = 0;
  for (const id of seated) {
    while (tables[snake[cursor]].length >= sizes[snake[cursor]]) cursor++;
    tables[snake[cursor]].push(id);
    cursor++;
  }

  return {
    tables: tables.map((participantIds, i) => ({
      tableNo: i + 1,
      participantIds,
    })),
    byes,
  };
}

// Her masadan ilk `advancePerTable` kişi çıkar; sıra: tüm birinciler, sonra ikinciler...
// Bu sıra bir sonraki turun yılan dağıtımında seed olarak kullanılır.
// Masa küçük kaldıysa (ör. 3'lük oyunda 2 kişilik masa) en az bir kişi elenir ki tur
// ilerlesin; tek kişilik bay masasındaki oyuncu her zaman çıkar.
export function pickAdvancers(
  rankedTables: RankedTableEntry[][],
  advancePerTable: number,
): number[] {
  const result: number[] = [];
  for (let place = 0; place < advancePerTable; place++)
    for (const table of rankedTables) {
      const limit = table.length === 1 ? 1 : table.length - 1;
      const entry = table[place];
      if (entry && place < limit) result.push(entry.participantId);
    }
  return result;
}

export interface EliminationResult {
  round: number;
  isFinal: boolean;
  isThirdPlace?: boolean;
  tableRank?: number; // masa henüz skorlanmadıysa boş
}

export interface FinalRankingRow extends StandingRow {
  elimination?: EliminationResult;
}

export interface EliminationTable {
  round: number;
  isCompleted: boolean;
  isThirdPlace?: boolean;
  players: { participantId: number; rank?: number }[];
}

// Turnuvanın genel sıralaması: elemede en ileri gidenler üstte (aynı turda
// masadaki sıraya, sonra lig sırasına göre; final turunda 3.'lük masası finalin
// arkasından gelir), elemeye çıkamayanlar lig sırasıyla sonda.
export function computeFinalRanking(
  leagueStandings: StandingRow[],
  eliminationTables: EliminationTable[],
): FinalRankingRow[] {
  if (!eliminationTables.length) return leagueStandings;

  const lastRound = Math.max(...eliminationTables.map((t) => t.round));
  const isFinalRound =
    eliminationTables.filter((t) => t.round === lastRound && !t.isThirdPlace)
      .length === 1;

  const reached = new Map<number, EliminationResult>();
  [...eliminationTables]
    .sort((a, b) => a.round - b.round)
    .forEach((table) =>
      table.players.forEach((player) =>
        reached.set(player.participantId, {
          round: table.round,
          isFinal:
            isFinalRound && table.round === lastRound && !table.isThirdPlace,
          isThirdPlace: table.isThirdPlace || undefined,
          tableRank: table.isCompleted ? player.rank : undefined,
        }),
      ),
    );

  const inElimination = leagueStandings
    .filter((row) => reached.has(row.participantId))
    .sort((a, b) => {
      const ra = reached.get(a.participantId);
      const rb = reached.get(b.participantId);
      return (
        rb.round - ra.round ||
        Number(!!ra.isThirdPlace) - Number(!!rb.isThirdPlace) ||
        (ra.tableRank ?? 0) - (rb.tableRank ?? 0) ||
        a.rank - b.rank
      );
    });
  const rest = leagueStandings.filter((row) => !reached.has(row.participantId));

  return [...inElimination, ...rest].map((row, i) => ({
    ...row,
    rank: i + 1,
    elimination: reached.get(row.participantId),
  }));
}
