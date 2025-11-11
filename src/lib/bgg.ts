import axios from 'axios';
import { GameDto } from 'src/modules/game/game.dto';

const BGG_API_URL = 'https://boardgamegeek.com/xmlapi2/thing';

const buildHeaders = () => ({
  'User-Agent': 'Mozilla/5.0',
  ...(process.env.BGG_API_TOKEN && {
    Authorization: `Bearer ${process.env.BGG_API_TOKEN}`
  }),
});

const parseItem = (itemXml: string): GameDto | undefined => {
  const idMatch = itemXml.match(/<item[^>]*id="(\d+)"/);
  const typeMatch = itemXml.match(/<item[^>]*type="([^"]+)"/);
  const primaryNameMatch = itemXml.match(/<name[^>]*type="primary"[^>]*value="([^"]+)"/);
  const fallbackNameMatch = itemXml.match(/<name[^>]*value="([^"]+)"/);
  const imageMatch = itemXml.match(/<image>([^<]+)<\/image>/);
  const thumbnailMatch = itemXml.match(/<thumbnail>([^<]+)<\/thumbnail>/);

  const name = (primaryNameMatch ?? fallbackNameMatch)?.[1];
  if (!name) return undefined;

  return {
    _id: Number(idMatch?.[1]),
    name,
    expansion: typeMatch?.[1] === 'boardgameexpansion',
    image: imageMatch?.[1] ?? '',
    thumbnail: thumbnailMatch?.[1] ?? '',
  };
};

const extractItems = (xml: string): GameDto[] => {
  const itemMatches = xml.matchAll(/<item[^>]*>[\s\S]*?<\/item>/g);
  return Array.from(itemMatches, match => parseItem(match[0])).filter(Boolean) as GameDto[];
};

export const getGameDetails = async (id: number): Promise<GameDto> => {
  try {
    const response = await axios.get(BGG_API_URL, {
      params: { id },
      headers: buildHeaders(),
      timeout: 30000,
    });

    const game = extractItems(response.data)[0];
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
