import {
  CATAN_PLAN_MAX_PLAYERS,
  CATAN_PLAN_MIN_PLAYERS,
  catanPlanFor,
  planCatanRound,
} from './tournament.catan-plan';
import {
  computeStandings,
  pairRound,
  pickAdvancers,
  PlayedMatch,
  RankedTableEntry,
  seedEliminationTables,
  shuffle,
  StandingOptions,
  TableAssignment,
  Tiebreaker,
} from './tournament.fixture';

export enum TournamentFormat {
  LEAGUE = 'league', // tek aşama: sadece Swiss/lig
  ELIMINATION = 'elimination', // tek aşama: masadan kazananlar üst tura
  LEAGUE_THEN_ELIMINATION = 'league_then_elimination', // iki aşama
}

export enum PairingMode {
  SWISS = 'swiss',
  RANDOM = 'random',
  CATAN_PLAN = 'catan_plan', // önceden hazırlanmış Catan oturma planı (numara çekilişi)
}

export enum MatchStage {
  LEAGUE = 'league',
  ELIMINATION = 'elimination',
}

export interface TournamentRules {
  format: TournamentFormat;
  pairingMode: PairingMode;
  tableSize: number;
  eliminationTableSize?: number; // boşsa tableSize
  minTableSize: number;
  leagueRounds: number;
  advanceCount: number;
  advancePerTable: number;
  thirdPlaceMatch?: boolean; // final turunda yarı finalde elenenler de bir masada oynar
  tiebreaker?: Tiebreaker; // boşsa rakiplerin ortalama puanı
  scoreCap?: number;
}

export const standingOptions = (
  rules: TournamentRules,
  lotNumbers?: Map<number, number>,
): StandingOptions => ({
  tiebreaker: rules.tiebreaker,
  scoreCap: rules.scoreCap,
  tableSize: rules.tableSize,
  lotNumbers,
});

export interface MatchState {
  stage: MatchStage;
  round: number;
  tableNo: number;
  isBye: boolean;
  isCompleted: boolean;
  isThirdPlace?: boolean;
  players: {
    participantId: number;
    score?: number;
    rank?: number;
    points?: number;
  }[];
}

export interface NextRound {
  stage: MatchStage;
  round: number;
  tables: TableAssignment[];
  byes: number[];
  thirdPlace?: number[]; // 3.'lük masasında oturanlar
}

export type FixtureErrorCode =
  | 'INCOMPLETE_ROUND'
  | 'NOT_ENOUGH_PARTICIPANTS'
  | 'NO_PROGRESS'
  | 'PLAN_PLAYER_COUNT'
  | 'PLAN_NUMBERS_MISSING';

export class FixtureError extends Error {
  constructor(readonly code: FixtureErrorCode) {
    super(code);
  }
}

const lastRound = (matches: MatchState[]) =>
  matches.reduce((max, m) => Math.max(max, m.round), 0);

const toPlayed = (matches: MatchState[]): PlayedMatch[] =>
  matches.map((m) => ({
    isBye: m.isBye,
    players: m.players.map((p) => ({
      participantId: p.participantId,
      points: p.points ?? 0,
      score: p.score,
      rank: p.rank,
    })),
  }));

// Plan numaralara yazıldığı için oyuncu sayısı sadece numaraların çekildiği ilk turda denetlenir;
// sonraki turlarda ayrılanların koltuğu boş kalır (masa küçülür).
function nextCatanPlanRound(
  participantIds: number[],
  round: number,
  drawNumbers: Map<number, number>,
  planSize: number,
): NextRound {
  if (
    round === 1 &&
    (participantIds.length < CATAN_PLAN_MIN_PLAYERS ||
      participantIds.length > CATAN_PLAN_MAX_PLAYERS)
  )
    throw new FixtureError('PLAN_PLAYER_COUNT');
  const participantByNumber = new Map<number, number>();
  for (const id of participantIds) {
    const number = drawNumbers.get(id);
    if (number === undefined) throw new FixtureError('PLAN_NUMBERS_MISSING');
    participantByNumber.set(number, id);
  }
  return {
    stage: MatchStage.LEAGUE,
    round,
    tables: planCatanRound(round, participantByNumber, catanPlanFor(planSize)),
    byes: [],
  };
}

function nextLeagueRound(
  rules: TournamentRules,
  participantIds: number[],
  league: MatchState[],
  round: number,
  random: () => number,
  drawNumbers: Map<number, number>,
  planSize: number,
): NextRound {
  if (participantIds.length < rules.minTableSize)
    throw new FixtureError('NOT_ENOUGH_PARTICIPANTS');
  if (rules.pairingMode === PairingMode.CATAN_PLAN)
    return nextCatanPlanRound(participantIds, round, drawNumbers, planSize);

  const previousOpponents = new Map<number, Set<number>>();
  const previousByes = new Set<number>();
  for (const match of league) {
    const matchIds = match.players.map((p) => p.participantId);
    if (match.isBye) {
      matchIds.forEach((id) => previousByes.add(id));
      continue;
    }
    for (const a of matchIds)
      for (const b of matchIds)
        if (a !== b)
          previousOpponents.set(
            a,
            (previousOpponents.get(a) ?? new Set()).add(b),
          );
  }

  const rankedIds =
    round === 1 || rules.pairingMode === PairingMode.RANDOM
      ? shuffle(participantIds, random)
      : computeStandings(
          participantIds,
          toPlayed(league),
          standingOptions(rules, drawNumbers),
        ).map((row) => row.participantId);

  const { tables, byes } = pairRound({
    rankedIds,
    tableSize: rules.tableSize,
    minTableSize: rules.minTableSize,
    previousOpponents,
    previousByes,
    random,
  });
  return { stage: MatchStage.LEAGUE, round, tables, byes };
}

export const eliminationTableSize = (rules: TournamentRules) =>
  rules.eliminationTableSize || rules.tableSize;

function firstEliminationRound(
  rules: TournamentRules,
  seeds: number[],
): NextRound {
  if (seeds.length < 2) throw new FixtureError('NOT_ENOUGH_PARTICIPANTS');
  return {
    stage: MatchStage.ELIMINATION,
    round: 1,
    ...seedEliminationTables(seeds, eliminationTableSize(rules)),
  };
}

// Final kurulurken 3.'lük maçı açıksa bir önceki turda elenenler (masa sırasına göre,
// en fazla bir masa dolusu) ayrı bir masada oynar
function thirdPlacePlayers(
  rules: TournamentRules,
  rankedTables: RankedTableEntry[][],
  advancers: number[],
  active: Set<number>,
) {
  const eliminated = rankedTables
    .flat()
    .filter((p) => active.has(p.participantId))
    .filter((p) => !advancers.includes(p.participantId))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, eliminationTableSize(rules))
    .map((p) => p.participantId);
  return eliminated.length >= 2 ? eliminated : undefined;
}

// Son eleme turu tek masaysa (3.'lük masası sayılmaz) final oynanmıştır → null.
// Bay geçenler (tek oyunculu, sırası olmayan maç) masa birincisi gibi üst tura çıkar.
// Catan: finalde sandalye, renk ve başlangıç sırası ön eleme sıralamasına göre seçilir (CWC 1.1.6);
// bu yüzden üst tura çıkanlar masa sırasına değil ön eleme sıralarına göre dizilir
function orderByLeagueRank(
  rules: TournamentRules,
  participantIds: number[],
  league: MatchState[],
  drawNumbers: Map<number, number>,
  advancers: number[],
) {
  const rank = new Map(
    computeStandings(
      participantIds,
      toPlayed(league),
      standingOptions(rules, drawNumbers),
    ).map((row) => [row.participantId, row.rank]),
  );
  return [...advancers].sort(
    (a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity),
  );
}

function nextEliminationRound(
  rules: TournamentRules,
  participantIds: number[],
  elimination: MatchState[],
  league: MatchState[],
  drawNumbers: Map<number, number>,
): NextRound | null {
  const round = lastRound(elimination);
  const lastTables = elimination
    .filter((m) => m.round === round && !m.isThirdPlace)
    .sort((a, b) => a.tableNo - b.tableNo);
  if (lastTables.length === 1) return null;

  const rankedTables: RankedTableEntry[][] = lastTables.map((m) =>
    [...m.players]
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .map((p) => ({
        participantId: p.participantId,
        score: p.score ?? 0,
        rank: p.rank ?? 0,
        points: p.points ?? 0,
      })),
  );
  // Turnuvadan çıkarılan (pasif) oyuncu masadan çıkmış olsa da sonraki tura alınmaz
  const active = new Set(participantIds);
  const advancers = pickAdvancers(rankedTables, rules.advancePerTable).filter(
    (id) => active.has(id),
  );
  const playerCount = lastTables.reduce((sum, m) => sum + m.players.length, 0);
  if (advancers.length < 2 || advancers.length >= playerCount)
    throw new FixtureError('NO_PROGRESS');

  const previousByes = new Set(
    elimination
      .filter((m) => m.isBye)
      .flatMap((m) => m.players.map((p) => p.participantId)),
  );
  const seeds =
    rules.tiebreaker === Tiebreaker.SCORE
      ? orderByLeagueRank(rules, participantIds, league, drawNumbers, advancers)
      : advancers;
  const pairing = seedEliminationTables(
    seeds,
    eliminationTableSize(rules),
    previousByes,
  );
  const isFinal = pairing.tables.length === 1 && !pairing.byes.length;
  return {
    stage: MatchStage.ELIMINATION,
    round: round + 1,
    ...pairing,
    thirdPlace:
      isFinal && rules.thirdPlaceMatch
        ? thirdPlacePlayers(rules, rankedTables, advancers, active)
        : undefined,
  };
}

// Oynanan maçlara bakıp sıradaki turu planlar; turnuva bittiyse null döner.
export function planNextRound(
  rules: TournamentRules,
  participantIds: number[],
  matches: MatchState[],
  random: () => number = Math.random,
  drawNumbers: Map<number, number> = new Map(),
  planSize: number = CATAN_PLAN_MAX_PLAYERS,
): NextRound | null {
  if (matches.some((m) => !m.isCompleted))
    throw new FixtureError('INCOMPLETE_ROUND');

  const league = matches.filter((m) => m.stage === MatchStage.LEAGUE);
  const elimination = matches.filter((m) => m.stage === MatchStage.ELIMINATION);
  if (elimination.length)
    return nextEliminationRound(
      rules,
      participantIds,
      elimination,
      league,
      drawNumbers,
    );

  if (rules.format === TournamentFormat.ELIMINATION)
    return firstEliminationRound(rules, shuffle(participantIds, random));

  const playedRounds = lastRound(league);
  if (playedRounds < rules.leagueRounds)
    return nextLeagueRound(
      rules,
      participantIds,
      league,
      playedRounds + 1,
      random,
      drawNumbers,
      planSize,
    );
  if (rules.format === TournamentFormat.LEAGUE) return null;

  const standings = computeStandings(
    participantIds,
    toPlayed(league),
    standingOptions(rules, drawNumbers),
  );
  return firstEliminationRound(
    rules,
    standings.slice(0, rules.advanceCount).map((row) => row.participantId),
  );
}
