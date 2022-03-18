import bggClient, { getBggThing } from 'bgg-xml-api-client';

export const getGameDetails = async (id: number) => {
  const response = await getBggThing({ id });
  const item = response.data;
  if (!item) return 'Item not found';
  return {
    _id: item.id,
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
