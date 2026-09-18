import {
  ReservedStockDetail,
  ReservedStockEntry,
} from 'src/modules/accounting/count.schema';
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

// Siparişin stoktan düştüğü ürünler menü ürününün tarifinden gelir; sayımda
// gösterilen ayrılmış adet de aynı şekilde tarif üzerinden hesaplanır.
export function toReservedStockEntries(
  item: any,
  quantity: number,
  detail: Omit<ReservedStockDetail, 'quantity'>,
): ReservedStockEntry[] {
  return (item?.itemProduction ?? [])
    .filter((ingredient: any) => ingredient?.isDecrementStock)
    .map((ingredient: any) => ({
      ...detail,
      product: ingredient.product,
      quantity: (ingredient.quantity ?? 0) * quantity,
    }));
}
