import axios from 'axios';
import { GameDto } from 'src/modules/game/game.dto';

const BGG_API_URL = 'https://boardgamegeek.com/xmlapi2/thing';

type Headers = Record<string, string>;

const buildHeaders = (): Headers => {
  const headers: Headers = {
    'User-Agent': 'Mozilla/5.0',
  };

  const apiToken = process.env.BGG_API_TOKEN;

  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
  } else {
    console.warn('No BGG_API_TOKEN found in environment variables!');
  }

  return headers;
};

const parseItem = (itemXml: string, fallbackId?: number): GameDto | undefined => {
  const idMatch = itemXml.match(/<item[^>]*id="(\d+)"/);
  const typeMatch = itemXml.match(/<item[^>]*type="([^"]+)"/);
  const primaryNameMatch = itemXml.match(/<name[^>]*type="primary"[^>]*value="([^"]+)"/);
  const fallbackNameMatch = itemXml.match(/<name[^>]*value="([^"]+)"/);
  const imageMatch = itemXml.match(/<image>([^<]+)<\/image>/);
  const thumbnailMatch = itemXml.match(/<thumbnail>([^<]+)<\/thumbnail>/);

  const name = (primaryNameMatch ?? fallbackNameMatch)?.[1];

  if (!name) {
    return undefined;
  }

  return {
    _id: Number(idMatch?.[1] ?? fallbackId),
    name,
    expansion: typeMatch?.[1] === 'boardgameexpansion',
    image: imageMatch?.[1] ?? '',
    thumbnail: thumbnailMatch?.[1] ?? '',
  };
};

const extractItems = (xml: string): GameDto[] => {
  const itemMatches = xml.matchAll(/<item[^>]*>[\s\S]*?<\/item>/g);
  const parsedItems: GameDto[] = [];

  for (const match of itemMatches) {
    const game = parseItem(match[0]);
    if (game) {
      parsedItems.push(game);
    }
  }

  return parsedItems;
};

export const getGameDetails = async (id: number): Promise<GameDto> => {
  try {
    const response = await axios.get(BGG_API_URL, {
      params: { id },
      headers: buildHeaders(),
      timeout: 30000,
    });

    const items = extractItems(response.data);
    const game = items[0];

    if (!game) {
      console.warn(`Item not found or invalid for id: ${id}`);
      return;
    }

    return { ...game, _id: game._id ?? id };
  } catch (err) {
    console.error(`Error fetching game with id: ${id}`, err);
    return;
  }
};

export const getMultipleGameDetails = async (ids: number) => {
  try {
    const response = await axios.get(BGG_API_URL, {
      params: { id: ids },
      headers: buildHeaders(),
      timeout: 30000,
    });

    return extractItems(response.data);
  } catch (err) {
    console.error(`Error fetching games with ids: ${ids}`, err);
    return [];
  }
};
