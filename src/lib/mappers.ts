import { Game } from 'src/modules/game/game.schema';

export function mapGames(games: any): Game[] {
  return games.map((game: any) => {
    return {
      _id: game._id,
      name: game.title,
      expansion: game.expansion,
      image: game.image,
      thumbnail: game.thumbnail,
    };
  });
}
