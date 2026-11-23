import {
  AssistantStyle,
  ASSISTANT_STYLES,
  Difficulty,
  DIFFICULTY_WEIGHT_RANGES,
  GAME_ASSISTANT_LIMITS,
  STYLE_RULES,
} from './game-assistant.constants';

// bgggames kaydının kullandığımız alanları.
export interface BggData {
  PlayersMin?: number;
  PlayersMax?: number;
  PlayTimeMin?: number;
  PlayTimeMax?: number;
  AvgWeight?: number;
  MinPlayerAge?: number;
  Best?: number[];
  Categories?: number[];
  Mechanics?: number[];
  Subdomains?: number[];
}

// ShopifyService.getGamesForWebSite() çıktısındaki bir oyunun kullandığımız alanları.
// bggId populate edilmişse nesne, edilmemişse sayıdır.
export interface WebsiteGame {
  _id: number;
  name: string;
  image?: string;
  expansion?: boolean;
  locations?: number[];
  davinciGame?: boolean;
  onlineStoreUrl?: string | null;
  bggId?: BggData | number | null;
}

export interface CatalogGame {
  id: number;
  name: string;
  image?: string;
  playersMin: number;
  playersMax: number;
  best: number[];
  minutesMin: number;
  minutesMax: number;
  weight: number;
  minAge: number;
  styles: AssistantStyle[];
  codes: number[];
  popularity: number;
  davinciGame: boolean;
  onlineStoreUrl: string | null;
}

export interface SearchQuery {
  players?: number;
  maxMinutes?: number;
  difficulty?: Difficulty;
  styles?: AssistantStyle[];
  minAge?: number;
  excludeIds?: number[];
}

export type RelaxedField = 'maxMinutes' | 'difficulty' | 'styles';

const hasAny = (values: number[] = [], wanted: number[] = []) =>
  wanted.some((w) => values.includes(w));

export const toCatalogGame = (
  game: WebsiteGame,
  popularity: number,
): CatalogGame | null => {
  const bgg = game.bggId;
  if (game.expansion || !game.locations?.length) return null;
  if (!bgg || typeof bgg !== 'object' || !bgg.PlayersMin || !bgg.PlayersMax) {
    return null;
  }
  const styles = ASSISTANT_STYLES.filter((style) => {
    const rule = STYLE_RULES[style];
    return (
      hasAny(bgg.Subdomains, rule.subdomains) ||
      hasAny(bgg.Categories, rule.categories) ||
      hasAny(bgg.Mechanics, rule.mechanics)
    );
  });
  return {
    id: game._id,
    name: game.name,
    image: game.image,
    playersMin: bgg.PlayersMin,
    playersMax: bgg.PlayersMax,
    best: bgg.Best ?? [],
    minutesMin: bgg.PlayTimeMin ?? bgg.PlayTimeMax ?? 0,
    minutesMax: bgg.PlayTimeMax ?? bgg.PlayTimeMin ?? 0,
    weight: bgg.AvgWeight ?? 0,
    minAge: bgg.MinPlayerAge ?? 0,
    styles,
    codes: [...(bgg.Categories ?? []), ...(bgg.Mechanics ?? [])],
    popularity,
    davinciGame: Boolean(game.davinciGame),
    onlineStoreUrl: game.onlineStoreUrl ?? null,
  };
};

const matches = (game: CatalogGame, q: SearchQuery) => {
  if (q.excludeIds?.includes(game.id)) return false;
  if (
    q.players &&
    (q.players < game.playersMin || q.players > game.playersMax)
  ) {
    return false;
  }
  // BGG'nin üst süresi çoğu zaman abartılı: alt süre ölçülür.
  if (q.maxMinutes && game.minutesMin > q.maxMinutes) return false;
  if (q.difficulty) {
    const [min, max] = DIFFICULTY_WEIGHT_RANGES[q.difficulty];
    if (game.weight < min || game.weight > max) return false;
  }
  if (q.minAge && game.minAge > q.minAge) return false;
  if (q.styles?.length && !q.styles.some((s) => game.styles.includes(s))) {
    return false;
  }
  return true;
};

const score = (game: CatalogGame, q: SearchQuery) =>
  Math.log1p(game.popularity) +
  (q.players && game.best.includes(q.players) ? 2 : 0) +
  (game.davinciGame ? 1 : 0);

const rank = (games: CatalogGame[], q: SearchQuery, limit: number) =>
  games
    .filter((g) => matches(g, q))
    .sort((a, b) => score(b, q) - score(a, q))
    .slice(0, limit);

// Sonuç yoksa kısıtlar sırayla gevşetilir: süre x1.5, zorluk, stil.
export const searchGames = (
  catalog: CatalogGame[],
  query: SearchQuery,
  limit = GAME_ASSISTANT_LIMITS.maxSearchResults,
): { games: CatalogGame[]; relaxed: RelaxedField[] } => {
  const relaxed: RelaxedField[] = [];
  let q: SearchQuery = { ...query };
  let games = rank(catalog, q, limit);
  const steps: [RelaxedField, (s: SearchQuery) => SearchQuery][] = [
    [
      'maxMinutes',
      (s) => ({
        ...s,
        maxMinutes: s.maxMinutes && Math.round(s.maxMinutes * 1.5),
      }),
    ],
    ['difficulty', (s) => ({ ...s, difficulty: undefined })],
    ['styles', (s) => ({ ...s, styles: undefined })],
  ];
  for (const [field, relax] of steps) {
    if (games.length) break;
    if (q[field] === undefined) continue;
    q = relax(q);
    relaxed.push(field);
    games = rank(catalog, q, limit);
  }
  return { games, relaxed };
};

// Kategori + mekanik kodlarında Jaccard benzerliği.
export const similarGames = (
  catalog: CatalogGame[],
  id: number,
  query: Pick<SearchQuery, 'players' | 'maxMinutes'>,
  limit = GAME_ASSISTANT_LIMITS.maxSimilarResults,
): CatalogGame[] => {
  const base = catalog.find((g) => g.id === id);
  if (!base) return [];
  const baseCodes = new Set(base.codes);
  const similarity = (g: CatalogGame) => {
    const shared = g.codes.filter((c) => baseCodes.has(c)).length;
    const union = new Set([...g.codes, ...base.codes]).size;
    return union ? shared / union : 0;
  };
  return catalog
    .filter((g) => g.id !== id && matches(g, query) && similarity(g) > 0)
    .sort(
      (a, b) => similarity(b) - similarity(a) || b.popularity - a.popularity,
    )
    .slice(0, limit);
};
