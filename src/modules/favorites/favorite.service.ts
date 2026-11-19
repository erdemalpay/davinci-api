import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ShopifyService } from '../shopify/shopify.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { FavoriteItemDto, FavoriteProductsFilter } from './favorite.dto';
import { Favorite } from './favorite.schema';

// A customer can't grow an unbounded list through the storefront.
export const MAX_FAVORITES_PER_CUSTOMER = 500;
// Shopify `nodes(ids:)` accepts at most 250 ids per call.
const SHOPIFY_NODES_CHUNK = 250;

export type FavoriteProduct = {
  productId: string;
  handle: string;
  title: string;
  status: string;
  imageUrl: string | null;
  price: number | null;
  compareAtPrice: number | null;
  totalInventory: number | null;
  onlineStoreUrl: string | null;
};

export type FavoriteCustomer = {
  customerId: string;
  name: string;
  email: string | null;
  numberOfOrders: number | null;
};

// Accepts "123" or "gid://shopify/Product/123"; anything else is rejected.
export const numericShopifyId = (value: any): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const id = String(value).split('/').pop();
  return id && /^\d+$/.test(id) ? id : null;
};

const toNumberOrNull = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const cleanHandle = (value: any): string | undefined =>
  typeof value === 'string' && /^[a-z0-9-]{1,255}$/i.test(value)
    ? value
    : undefined;

const chunk = <T>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

@Injectable()
export class FavoriteService {
  private readonly logger = new Logger(FavoriteService.name);

  constructor(
    @InjectModel(Favorite.name)
    private readonly favoriteModel: Model<Favorite>,
    private readonly shopifyService: ShopifyService,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  // ---------------------------------------------------------------- storefront

  // What the theme needs to paint the hearts and the favorites page.
  // With `refresh`, handles are checked against Shopify and deleted products
  // are dropped (the favorites page asks for this; every other page does not,
  // so a normal page view never waits on Shopify).
  async getStorefrontList(shopifyCustomerId: string, refresh = false) {
    if (refresh) {
      await this.getCustomerFavorites(shopifyCustomerId);
    }
    const favorites = await this.favoriteModel
      .find({ shopifyCustomerId })
      .sort({ createdAt: -1 })
      .lean();
    return {
      items: favorites.map((f) => ({
        productId: f.shopifyProductId,
        handle: f.handle ?? null,
        addedAt: f.createdAt,
      })),
    };
  }

  async add(shopifyCustomerId: string, item: FavoriteItemDto) {
    const productId = this.requireProductId(item?.productId);
    const count = await this.favoriteModel.countDocuments({
      shopifyCustomerId,
    });
    if (count >= MAX_FAVORITES_PER_CUSTOMER) {
      const exists = await this.favoriteModel.exists({
        shopifyCustomerId,
        shopifyProductId: productId,
      });
      if (!exists) {
        throw new HttpException(
          `En fazla ${MAX_FAVORITES_PER_CUSTOMER} ürün favorilere eklenebilir`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const handle = cleanHandle(item?.handle);
    const existing = await this.favoriteModel.findOne({
      shopifyCustomerId,
      shopifyProductId: productId,
    });
    if (existing) {
      if (handle && existing.handle !== handle) {
        existing.handle = handle;
        await existing.save();
      }
    } else {
      await this.insert(shopifyCustomerId, productId, handle);
    }
    this.websocketGateway.emitFavoritesChanged();
    return this.getStorefrontList(shopifyCustomerId);
  }

  async remove(shopifyCustomerId: string, item: FavoriteItemDto) {
    const productId = this.requireProductId(item?.productId);
    await this.favoriteModel.deleteOne({
      shopifyCustomerId,
      shopifyProductId: productId,
    });
    this.websocketGateway.emitFavoritesChanged();
    return this.getStorefrontList(shopifyCustomerId);
  }

  // Called once after a visitor logs in: what they hearted as a guest (kept in
  // the browser) is added to the account. Existing favorites are untouched.
  async merge(shopifyCustomerId: string, items: FavoriteItemDto[]) {
    const unique = new Map<string, string | undefined>();
    for (const item of Array.isArray(items) ? items : []) {
      const productId = numericShopifyId(item?.productId);
      if (productId && !unique.has(productId)) {
        unique.set(productId, cleanHandle(item?.handle));
      }
    }

    const existing = await this.favoriteModel
      .find({ shopifyCustomerId })
      .select('shopifyProductId')
      .lean();
    const existingIds = new Set(existing.map((f) => f.shopifyProductId));
    const room = Math.max(0, MAX_FAVORITES_PER_CUSTOMER - existingIds.size);
    const toInsert = [...unique.entries()]
      .filter(([productId]) => !existingIds.has(productId))
      .slice(0, room);

    if (toInsert.length) {
      // One by one: ids come from the auto-increment plugin, which only runs on save.
      for (const [productId, handle] of toInsert) {
        await this.insert(shopifyCustomerId, productId, handle);
      }
      this.websocketGateway.emitFavoritesChanged();
    }
    return this.getStorefrontList(shopifyCustomerId);
  }

  // --------------------------------------------------------------------- panel

  async getSummary() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [totalFavorites, customers, products, last30Days] = await Promise.all(
      [
        this.favoriteModel.countDocuments({}),
        this.favoriteModel.distinct('shopifyCustomerId'),
        this.favoriteModel.distinct('shopifyProductId'),
        this.favoriteModel.countDocuments({ createdAt: { $gte: since } }),
      ],
    );
    return {
      totalFavorites,
      customerCount: customers.length,
      productCount: products.length,
      addedLast30Days: last30Days,
    };
  }

  // Customer detail page: every favorite with live product data from Shopify.
  async getCustomerFavorites(shopifyCustomerId: string) {
    const favorites = await this.favoriteModel
      .find({ shopifyCustomerId })
      .sort({ createdAt: -1 })
      .lean();
    const products = await this.fetchProducts(
      favorites.map((f) => f.shopifyProductId),
    );
    await this.syncWithShopify(favorites, products);

    return favorites
      .filter((f) => products.has(f.shopifyProductId))
      .map((f) => ({
        ...products.get(f.shopifyProductId),
        addedAt: f.createdAt,
      }));
  }

  // Most favorited products, optionally only counting favorites added in a range.
  async getTopProducts(filter: FavoriteProductsFilter = {}) {
    const limit = Math.min(Math.max(Number(filter.limit) || 50, 1), 250);
    const createdAt: Record<string, Date> = {};
    const after = filter.after ? new Date(filter.after) : null;
    const before = filter.before ? new Date(filter.before) : null;
    if (after && !isNaN(after.getTime())) createdAt.$gte = after;
    if (before && !isNaN(before.getTime())) createdAt.$lt = before;
    const match = Object.keys(createdAt).length ? { createdAt } : {};

    const rows: { _id: string; count: number; lastAddedAt: Date }[] =
      await this.favoriteModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$shopifyProductId',
            count: { $sum: 1 },
            lastAddedAt: { $max: '$createdAt' },
          },
        },
        { $sort: { count: -1, lastAddedAt: -1 } },
        { $limit: limit },
      ]);

    const products = await this.fetchProducts(rows.map((r) => r._id));
    return rows
      .filter((r) => products.has(r._id))
      .map((r) => ({
        ...products.get(r._id),
        favoriteCount: r.count,
        lastAddedAt: r.lastAddedAt,
      }));
  }

  // Who favorited a product (newest first).
  async getProductCustomers(productIdParam: string) {
    const productId = this.requireProductId(productIdParam);
    const favorites = await this.favoriteModel
      .find({ shopifyProductId: productId })
      .sort({ createdAt: -1 })
      .lean();
    const customers = await this.fetchCustomers(
      favorites.map((f) => f.shopifyCustomerId),
    );
    return favorites.map((f) => ({
      customerId: f.shopifyCustomerId,
      name: customers.get(f.shopifyCustomerId)?.name ?? null,
      email: customers.get(f.shopifyCustomerId)?.email ?? null,
      numberOfOrders:
        customers.get(f.shopifyCustomerId)?.numberOfOrders ?? null,
      addedAt: f.createdAt,
    }));
  }

  // Favorite counts for a page of the customer list: { [customerId]: count }.
  async getCountsByCustomer(customerIds: string[]) {
    const ids = [
      ...new Set(customerIds.map(numericShopifyId).filter(Boolean)),
    ] as string[];
    if (!ids.length) return {};
    const rows: { _id: string; count: number }[] =
      await this.favoriteModel.aggregate([
        { $match: { shopifyCustomerId: { $in: ids } } },
        { $group: { _id: '$shopifyCustomerId', count: { $sum: 1 } } },
      ]);
    return Object.fromEntries(rows.map((r) => [r._id, r.count]));
  }

  // ------------------------------------------------------------------ helpers

  // A double click or two tabs can race; the unique index keeps one row.
  private async insert(
    shopifyCustomerId: string,
    shopifyProductId: string,
    handle?: string,
  ) {
    try {
      await this.favoriteModel.create({
        shopifyCustomerId,
        shopifyProductId,
        ...(handle ? { handle } : {}),
        createdAt: new Date(),
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  private requireProductId(value: any): string {
    const productId = numericShopifyId(value);
    if (!productId) {
      throw new HttpException('Geçersiz ürün', HttpStatus.BAD_REQUEST);
    }
    return productId;
  }

  // Drop favorites of products deleted from Shopify and keep handles current.
  private async syncWithShopify(
    favorites: { _id: number; shopifyProductId: string; handle?: string }[],
    products: Map<string, FavoriteProduct>,
  ) {
    const removed = favorites.filter((f) => !products.has(f.shopifyProductId));
    const renamed = favorites.filter((f) => {
      const product = products.get(f.shopifyProductId);
      return product && product.handle && product.handle !== f.handle;
    });
    if (!removed.length && !renamed.length) return;

    await this.favoriteModel.bulkWrite(
      [
        ...removed.map((f) => ({ deleteOne: { filter: { _id: f._id } } })),
        ...renamed.map((f) => ({
          updateOne: {
            filter: { _id: f._id },
            update: {
              $set: { handle: products.get(f.shopifyProductId).handle },
            },
          },
        })),
      ],
      { ordered: false },
    );
    if (removed.length) {
      this.logger.log(
        `Removed ${removed.length} favorites of products no longer in Shopify`,
      );
      this.websocketGateway.emitFavoritesChanged();
    }
  }

  private async fetchProducts(
    productIds: string[],
  ): Promise<Map<string, FavoriteProduct>> {
    const result = new Map<string, FavoriteProduct>();
    const ids = [...new Set(productIds)];
    for (const part of chunk(ids, SHOPIFY_NODES_CHUNK)) {
      const data = await this.shopifyService.adminGraphQL<{ nodes: any[] }>(
        `query FavoriteProducts($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              handle
              title
              status
              totalInventory
              onlineStoreUrl
              featuredMedia { preview { image { url } } }
              priceRangeV2 { minVariantPrice { amount } }
              compareAtPriceRange { minVariantCompareAtPrice { amount } }
            }
          }
        }`,
        { ids: part.map((id) => `gid://shopify/Product/${id}`) },
      );
      for (const node of data?.nodes ?? []) {
        const productId = numericShopifyId(node?.id);
        if (!productId) continue; // deleted products come back as null
        result.set(productId, {
          productId,
          handle: node.handle,
          title: node.title,
          status: node.status,
          imageUrl: node.featuredMedia?.preview?.image?.url ?? null,
          price: toNumberOrNull(node.priceRangeV2?.minVariantPrice?.amount),
          compareAtPrice: toNumberOrNull(
            node.compareAtPriceRange?.minVariantCompareAtPrice?.amount,
          ),
          totalInventory: toNumberOrNull(node.totalInventory),
          onlineStoreUrl: node.onlineStoreUrl ?? null,
        });
      }
    }
    return result;
  }

  private async fetchCustomers(
    customerIds: string[],
  ): Promise<Map<string, FavoriteCustomer>> {
    const result = new Map<string, FavoriteCustomer>();
    const ids = [...new Set(customerIds)];
    for (const part of chunk(ids, SHOPIFY_NODES_CHUNK)) {
      const data = await this.shopifyService.adminGraphQL<{ nodes: any[] }>(
        `query FavoriteCustomers($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Customer {
              id
              firstName
              lastName
              numberOfOrders
              defaultEmailAddress { emailAddress }
            }
          }
        }`,
        { ids: part.map((id) => `gid://shopify/Customer/${id}`) },
      );
      for (const node of data?.nodes ?? []) {
        const customerId = numericShopifyId(node?.id);
        if (!customerId) continue;
        result.set(customerId, {
          customerId,
          name:
            `${node.firstName ?? ''} ${node.lastName ?? ''}`.trim() ||
            node.defaultEmailAddress?.emailAddress ||
            customerId,
          email: node.defaultEmailAddress?.emailAddress ?? null,
          numberOfOrders: toNumberOrNull(node.numberOfOrders),
        });
      }
    }
    return result;
  }
}
