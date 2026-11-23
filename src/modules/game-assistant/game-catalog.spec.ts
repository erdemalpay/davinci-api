import {
  BggData,
  CatalogGame,
  searchGames,
  similarGames,
  toCatalogGame,
  WebsiteGame,
} from './game-catalog';

const bgg = (o: BggData = {}): BggData => ({
  PlayersMin: 2,
  PlayersMax: 4,
  PlayTimeMin: 30,
  PlayTimeMax: 60,
  AvgWeight: 2,
  MinPlayerAge: 10,
  Best: [],
  Categories: [],
  Mechanics: [],
  Subdomains: [],
  ...o,
});

const catan: WebsiteGame = {
  _id: 13,
  name: 'Catan',
  locations: [2],
  bggId: bgg({
    PlayersMin: 3,
    PlayersMax: 4,
    PlayTimeMin: 60,
    PlayTimeMax: 120,
    AvgWeight: 2.2827,
    Best: [4],
    Categories: [1021, 1026],
    Mechanics: [2072, 2008],
    Subdomains: [5499],
  }),
};
const codenames: WebsiteGame = {
  _id: 178900,
  name: 'Codenames',
  locations: [2],
  onlineStoreUrl: 'https://example.com/codenames',
  bggId: bgg({
    PlayersMin: 2,
    PlayersMax: 8,
    PlayTimeMin: 15,
    PlayTimeMax: 15,
    AvgWeight: 1.2559,
    Best: [6, 8],
    Categories: [1002, 1039, 1030, 1025],
    Mechanics: [2019],
    Subdomains: [5498],
  }),
};
const splendor: WebsiteGame = {
  _id: 148228,
  name: 'Splendor',
  locations: [2],
  bggId: bgg({
    PlayersMin: 2,
    PlayersMax: 4,
    PlayTimeMin: 30,
    PlayTimeMax: 30,
    AvgWeight: 1.79,
    Categories: [1002, 1021],
    Mechanics: [2041, 2004],
    Subdomains: [5499],
  }),
};

const catalog = (): CatalogGame[] =>
  (
    [
      [catan, 1930],
      [codenames, 1461],
      [splendor, 635],
    ] as [WebsiteGame, number][]
  )
    .map(([g, p]) => toCatalogGame(g, p))
    .filter((g): g is CatalogGame => g !== null);

describe('toCatalogGame', () => {
  it('skips expansions, games without a location and games without BGG data', () => {
    expect(toCatalogGame({ ...catan, expansion: true }, 0)).toBeNull();
    expect(toCatalogGame({ ...catan, locations: [] }, 0)).toBeNull();
    expect(toCatalogGame({ ...catan, bggId: 13 }, 0)).toBeNull();
  });

  it('derives styles from BGG codes', () => {
    const game = toCatalogGame(codenames, 0);
    expect(game?.styles).toEqual(
      expect.arrayContaining(['party', 'word', 'card', 'deduction']),
    );
  });
});

describe('searchGames', () => {
  it('filters by players, time and difficulty', () => {
    const { games, relaxed } = searchGames(catalog(), {
      players: 4,
      maxMinutes: 60,
      difficulty: 'easy',
    });
    expect(games.map((g) => g.id)).toEqual([178900, 148228]);
    expect(relaxed).toEqual([]);
  });

  it('ranks games whose best player count matches higher', () => {
    const { games } = searchGames(catalog(), { players: 4 });
    expect(games[0]?.id).toBe(13);
  });

  it('relaxes time, then difficulty, then styles when nothing matches', () => {
    const { games, relaxed } = searchGames(catalog(), {
      players: 3,
      maxMinutes: 10,
      difficulty: 'hard',
    });
    expect(relaxed).toEqual(['maxMinutes', 'difficulty']);
    expect(games.map((g) => g.id)).toEqual([178900]);
  });

  it('excludes the given ids', () => {
    const { games } = searchGames(catalog(), { players: 4, excludeIds: [13] });
    expect(games.map((g) => g.id)).not.toContain(13);
  });

  it('returns nothing for an impossible player count', () => {
    const { games } = searchGames(catalog(), { players: 15 });
    expect(games).toEqual([]);
  });
});

describe('similarGames', () => {
  it('never returns the game itself and prefers shared codes', () => {
    const games = similarGames(catalog(), 148228, {});
    expect(games.map((g) => g.id)).not.toContain(148228);
    expect(games[0]?.id).toBe(13);
  });

  it('returns an empty list for an unknown id', () => {
    expect(similarGames(catalog(), 999999, {})).toEqual([]);
  });
});
