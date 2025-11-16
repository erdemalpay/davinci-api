import axios from 'axios';
import { getBggThing } from 'bgg-xml-api-client';
import { GameDto } from 'src/modules/game/game.dto';

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

const toGameDto = (item: BggThingItem | undefined, fallbackId: number): GameDto | undefined => {
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

export const getGameDetails = async (id: number): Promise<GameDto | undefined> => {
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
