import axios from 'axios';
import { getBggThing } from 'bgg-xml-api-client';
import { GameDto } from 'src/modules/game/game.dto';

export type BggSimpleGameDto = {
  _id: number;
  name: string;
};

type BggHomeShoppingItem = {
  url?: string;
  title?: string;
};

export type BggHomeShoppingParams = {
  source?: string;
  countries?: string;
  page?: number;
};

export type BggHomeShoppingResult = {
  games: BggSimpleGameDto[];
  errorCount: number;
};

type BggNameNode = { type?: string; value?: string };
type BggThingItem = {
  id?: number | string;
  type?: string;
  name?: BggNameNode | BggNameNode[];
  image?: string;
  thumbnail?: string;
};

const ensureBggHeaders = () => {
  const headers = axios.defaults.headers.common;
  headers['User-Agent'] = 'Mozilla/5.0';

  if (process.env.BGG_API_TOKEN) {
    headers.Authorization = `Bearer ${process.env.BGG_API_TOKEN}`;
  }
};

const selectName = (name?: BggThingItem['name']): string | undefined => {
  if (!name) return undefined;
  const names = Array.isArray(name) ? name : [name];
  return (names.find(({ type }) => type === 'primary') ?? names[0])?.value;
};

const toGameDto = (
  item: BggThingItem | undefined,
  fallbackId: number,
): GameDto | undefined => {
  if (!item) return undefined;
  const name = selectName(item.name);
  if (!name) return undefined;

  return {
    _id: Number(item.id ?? fallbackId),
    name,
    expansion: item.type === 'boardgameexpansion',
    image: item.image ?? '',
    thumbnail: item.thumbnail ?? '',
  };
};

const extractAffiliateId = (url?: string): number | undefined => {
  if (!url) return undefined;
  const match = url.match(/\/geekaffiliate\/link\/(\d+)/);
  if (!match) return undefined;

  const id = Number(match[1]);
  return Number.isFinite(id) ? id : undefined;
};

export const getGameDetails = async (
  id: number,
): Promise<GameDto | undefined> => {
  ensureBggHeaders();

  try {
    const response = await getBggThing({ id });
    const { item } = response.data;
    const parsedItem = Array.isArray(item) ? item[0] : item;
    const game = toGameDto(parsedItem, id);

    if (!game) {
      console.warn(`Item not found with id: ${id}`);
      return;
    }

    return game;
  } catch (err) {
    console.error(`Error fetching game with id: ${id}`, err);
    return;
  }
};

export const getBggHomeShoppingGames = async ({
  source = 'browsebac',
  countries = 'US',
  page = 1,
}: BggHomeShoppingParams = {}): Promise<BggHomeShoppingResult> => {
  ensureBggHeaders();

  try {
    const response = await axios.get<BggHomeShoppingItem[]>(
      'https://api.geekdo.com/api/homeshopping',
      {
        params: { source, countries, page },
        headers: {
          accept: 'text/javascript, text/html, application/xml, text/xml, */*',
          origin: 'https://boardgamegeek.com',
          referer: 'https://boardgamegeek.com/',
          'x-requested-with': 'XMLHttpRequest',
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        },
        timeout: 20000,
      },
    );

    const games = (response.data || [])
      .map((item) => {
        const id = extractAffiliateId(item.url);
        const name = item.title?.trim();
        if (!id || !name) return undefined;
        return { _id: id, name };
      })
      .filter((item): item is BggSimpleGameDto => Boolean(item));

    return { games, errorCount: 0 };
  } catch (error) {
    console.error('Error fetching BGG homeshopping page', error);
    return { games: [], errorCount: 1 };
  }
};
