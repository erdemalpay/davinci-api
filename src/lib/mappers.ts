import {
  ReservedStockDetail,
  ReservedStockEntry,
} from 'src/modules/accounting/count.schema';
import { Game } from 'src/modules/game/game.schema';
import { OrderStatus } from 'src/modules/order/order.dto';
import { Order } from 'src/modules/order/order.schema';

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

// Siparişin ürünü hâlâ bu depoda rafta mı: iptal, iade ya da zayi edilmemiş,
// ön siparişte değil ve gel-al ise henüz depodan çıkmamış olmalı.
export function isOrderOnShelf(
  order: Order | undefined,
  stockLocation: number,
): boolean {
  if (order?.stockLocation !== stockLocation) return false;
  if (
    [OrderStatus.CANCELLED, OrderStatus.RETURNED, OrderStatus.WASTED].includes(
      order.status as OrderStatus,
    )
  ) {
    return false;
  }
  if ((order.item as any)?.isPreOrder) return false;
  return !(
    order.isShopifyPickUp &&
    (order.isShopifyPickUpOrderBrought || order.isShopifyCustomerPicked)
  );
}
