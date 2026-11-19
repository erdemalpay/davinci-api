export class FavoriteItemDto {
  // Shopify product id, numeric or gid.
  productId: string;
  handle?: string;
}

export class MergeFavoritesDto {
  items: FavoriteItemDto[];
}

export class FavoriteProductsFilter {
  limit?: number;
  // Only count favorites added in this range (ISO dates).
  after?: string;
  before?: string;
}
