import bggClient, { getBggThing } from 'bgg-xml-api-client';
import { GameDto } from 'src/modules/game/game.dto';
import { Game } from 'src/modules/game/game.schema';

export const getGameDetails = async (id: number): Promise<GameDto> => {
  const response = await getBggThing({ id });
  const { item } = response.data;
  if (!item) {
    console.warn(`Item not found with id: ${id}`);
    return;
  }
  return {
    _id: id,
    name: item.name.length ? item.name[0].value : item.name.value,
    expansion: item.type === 'boardgameexpansion',
    image: item.image,
    thumbnail: item.thumbnail,
  };
};

export const getMultipleGameDetails = async (ids: number) => {
  const response = await getBggThing({ id: ids });
  const items = response.data;
  return items.map((item) => ({
    _id: item.id,
    name: item.name.length ? item.name[0].value : item.name.value,
    expansion: item.type === 'boardgameexpansion',
    image: item.image,
    thumbnail: item.thumbnail,
  }));
};
