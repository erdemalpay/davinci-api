import Anthropic from '@anthropic-ai/sdk';
import {
  AssistantStyle,
  ASSISTANT_STYLES,
  Difficulty,
  DIFFICULTIES,
  GAME_ASSISTANT_LIMITS,
} from './game-assistant.constants';
import {
  CatalogGame,
  RelaxedField,
  SearchQuery,
  searchGames,
  similarGames,
} from './game-catalog';

export interface GameCard {
  id: number;
  name: string;
  image?: string;
  players: string;
  minutes: string;
  weight: number;
  reason: string;
  onlineStoreUrl: string | null;
}

// Bir isteğin araç durumu: ekrana basılan kartlar ve gevşetilen kısıtlar.
export interface ToolState {
  cards: GameCard[];
  relaxed: RelaxedField[];
}

const int = { type: 'integer' };

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_games',
    description:
      'Search the café library. Use before recommending. All fields optional.',
    input_schema: {
      type: 'object',
      properties: {
        players: int,
        maxMinutes: int,
        difficulty: { type: 'string', enum: [...DIFFICULTIES] },
        styles: {
          type: 'array',
          items: { type: 'string', enum: [...ASSISTANT_STYLES] },
        },
        minAge: { ...int, description: 'Age of the youngest player' },
        excludeIds: { type: 'array', items: int },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_game',
    description: 'Details of one library game. Use before describing a game.',
    input_schema: {
      type: 'object',
      properties: { id: int },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'similar_games',
    description: 'Library games similar to the given game.',
    input_schema: {
      type: 'object',
      properties: { id: int, players: int, maxMinutes: int },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'show_games',
    description:
      'Show game cards to the customer. The only way to recommend games. Max 5, ids from tool results only, one-sentence reason each in the customer’s language.',
    input_schema: {
      type: 'object',
      properties: {
        games: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: int, reason: { type: 'string' } },
            required: ['id', 'reason'],
            additionalProperties: false,
          },
        },
      },
      required: ['games'],
      additionalProperties: false,
    },
  },
];

type Input = Record<string, unknown>;

const posInt = (v: unknown): number | undefined =>
  Number.isInteger(v) && (v as number) > 0 ? (v as number) : undefined;
const intList = (v: unknown): number[] | undefined =>
  Array.isArray(v)
    ? v.filter((x): x is number => Number.isInteger(x))
    : undefined;

const parseSearch = (input: Input): SearchQuery => ({
  players: posInt(input.players),
  maxMinutes: posInt(input.maxMinutes),
  difficulty: DIFFICULTIES.includes(input.difficulty as Difficulty)
    ? (input.difficulty as Difficulty)
    : undefined,
  styles: Array.isArray(input.styles)
    ? input.styles.filter((s): s is AssistantStyle =>
        ASSISTANT_STYLES.includes(s as AssistantStyle),
      )
    : undefined,
  minAge: posInt(input.minAge),
  excludeIds: intList(input.excludeIds),
});

const difficultyLabel = (w: number) =>
  w <= 2 ? 'easy' : w < 2.8 ? 'medium' : 'hard';

const range = (min: number, max: number) =>
  min === max ? `${min}` : `${min}-${max}`;

const summary = (g: CatalogGame) => ({
  id: g.id,
  name: g.name,
  players: range(g.playersMin, g.playersMax),
  bestWith: g.best,
  minutes: range(g.minutesMin, g.minutesMax),
  difficulty: difficultyLabel(g.weight),
  minAge: g.minAge,
  styles: g.styles,
  playsAtCafeLastYear: g.popularity,
});

const toCard = (g: CatalogGame, reason: string): GameCard => ({
  id: g.id,
  name: g.name,
  image: g.image,
  players: range(g.playersMin, g.playersMax),
  minutes: range(g.minutesMin, g.minutesMax),
  weight: g.weight,
  reason: reason.slice(0, 200),
  onlineStoreUrl: g.onlineStoreUrl,
});

const error = (message: string) => JSON.stringify({ error: message });

// Araç sonucu modele JSON metin olarak döner.
export const executeTool = (
  name: string,
  rawInput: unknown,
  catalog: CatalogGame[],
  state: ToolState,
): string => {
  const input: Input =
    rawInput && typeof rawInput === 'object' ? (rawInput as Input) : {};
  const byId = (id: unknown) => catalog.find((g) => g.id === id);

  switch (name) {
    case 'search_games': {
      const { games, relaxed } = searchGames(catalog, parseSearch(input));
      state.relaxed.push(...relaxed.filter((r) => !state.relaxed.includes(r)));
      return JSON.stringify({ games: games.map(summary), relaxed });
    }
    case 'get_game': {
      const game = byId(input.id);
      if (!game) return error('Game is not in the café library.');
      return JSON.stringify({
        ...summary(game),
        onlineStoreUrl: game.onlineStoreUrl,
      });
    }
    case 'similar_games': {
      const { players, maxMinutes } = parseSearch(input);
      const id = posInt(input.id);
      if (!id || !byId(id)) return error('Game is not in the café library.');
      return JSON.stringify({
        games: similarGames(catalog, id, { players, maxMinutes }).map(summary),
      });
    }
    case 'show_games': {
      const requested = Array.isArray(input.games) ? input.games : [];
      for (const item of requested) {
        if (state.cards.length >= GAME_ASSISTANT_LIMITS.maxShowGames) break;
        const entry = item && typeof item === 'object' ? (item as Input) : {};
        const game = byId(entry.id);
        if (!game || state.cards.some((c) => c.id === game.id)) continue;
        state.cards.push(
          toCard(game, typeof entry.reason === 'string' ? entry.reason : ''),
        );
      }
      if (!state.cards.length) {
        return error(
          'None of these ids are in the café library. Search first.',
        );
      }
      return `Shown to the customer: ${state.cards
        .map((c) => c.name)
        .join(', ')}`;
    }
    default:
      return error(`Unknown tool: ${name}`);
  }
};
