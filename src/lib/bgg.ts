import bggClient from 'bgg';

const options = {
  timeout: 60000, // timeout of 60s (5s is the default)
  // see https://github.com/cujojs/rest/blob/master/docs/interceptors.md#module-rest/interceptor/retry
};

const bgg = bggClient(options);

export const getGameDetails = async (id: number) => {
  const results = await bgg('thing', { id });
  const item = results && results.items && results.items && results.items.item;
  if (!item) return 'Item not found';
  return {
    _id: item.id,
    title: item.name.length ? item.name[0].value : item.name.value,
    expansion: item.type === 'boardgameexpansion',
    image: item.image,
    thumbnail: item.thumbnail,
  };
};

export const getMultipleGameDetails = async (ids: number) => {
  const results = await bgg('thing', { id: ids });
  const items = results && results.items && results.items && results.items.item;
  return items.map((item) => ({
    _id: item.id,
    title: item.name.length ? item.name[0].value : item.name.value,
    expansion: item.type === 'boardgameexpansion',
    image: item.image,
    thumbnail: item.thumbnail,
  }));
};
