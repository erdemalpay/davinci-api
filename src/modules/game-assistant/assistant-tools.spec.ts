import { executeTool, ToolState } from './assistant-tools';
import { CatalogGame } from './game-catalog';

const game = (o: Partial<CatalogGame>): CatalogGame => ({
  id: 1,
  name: 'G',
  playersMin: 2,
  playersMax: 4,
  best: [],
  minutesMin: 30,
  minutesMax: 30,
  weight: 1.5,
  minAge: 8,
  styles: ['family'],
  codes: [1],
  popularity: 1,
  davinciGame: false,
  onlineStoreUrl: null,
  ...o,
});
const catalog = [
  game({ id: 13, name: 'Catan', codes: [1, 2] }),
  game({
    id: 178900,
    name: 'Codenames',
    codes: [1, 3],
    onlineStoreUrl: 'https://s/c',
  }),
];
const newState = (): ToolState => ({ cards: [], relaxed: [] });

describe('executeTool', () => {
  it('show_games keeps only catalog ids, dedupes and caps at 5', () => {
    const state = newState();
    const result = executeTool(
      'show_games',
      {
        games: [
          { id: 13, reason: 'a' },
          { id: 999999, reason: 'b' },
          { id: 13, reason: 'c' },
        ],
      },
      catalog,
      state,
    );
    expect(state.cards.map((c) => c.id)).toEqual([13]);
    expect(result).toContain('Catan');
  });

  it('show_games reports an error when no id is valid', () => {
    const state = newState();
    const result = executeTool(
      'show_games',
      { games: [{ id: 5, reason: 'x' }] },
      catalog,
      state,
    );
    expect(state.cards).toEqual([]);
    expect(JSON.parse(result)).toEqual({ error: expect.any(String) });
  });

  it('search_games ignores invalid input fields', () => {
    const result = JSON.parse(
      executeTool(
        'search_games',
        { players: 'four', styles: ['party', 'evil'] },
        catalog,
        newState(),
      ),
    );
    expect(Array.isArray(result.games)).toBe(true);
  });

  it('search_games records relaxed fields in the state', () => {
    const state = newState();
    executeTool('search_games', { players: 3, maxMinutes: 5 }, catalog, state);
    expect(state.relaxed).toContain('maxMinutes');
  });

  it('get_game returns the store link and an error for unknown ids', () => {
    expect(
      JSON.parse(executeTool('get_game', { id: 178900 }, catalog, newState())),
    ).toMatchObject({ name: 'Codenames', onlineStoreUrl: 'https://s/c' });
    expect(
      JSON.parse(executeTool('get_game', { id: 5 }, catalog, newState())),
    ).toEqual({ error: expect.any(String) });
  });

  it('rejects unknown tools', () => {
    expect(
      JSON.parse(executeTool('drop_tables', {}, catalog, newState())),
    ).toEqual({ error: expect.any(String) });
  });
});
