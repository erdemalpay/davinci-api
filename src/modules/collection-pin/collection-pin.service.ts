import { Injectable, Logger } from '@nestjs/common';
import { ShopifyService } from '../shopify/shopify.service';

// kutuoyunual.com: our own games (the "Da Vinci Oyunları" collection) are kept
// at the top of the big catalogue collections. Those collections use Shopify's
// manual order, so the pinning is done in Shopify itself and holds on every
// theme and every page.
export const PIN_SOURCE_HANDLE = 'da-vinci-oyunlari';
export const PIN_TARGET_HANDLES = ['kutu-oyunu', 'turkce-oyunlar'];

const PAGE_SIZE = 250;
const MAX_PAGES = 20;

// Pinned products go first, in the order they already have in the target
// (so a hand-made order among them is kept); everything else keeps its order.
export function pinnedOrder(current: string[], pinned: Set<string>): string[] {
  const top = current.filter((id) => pinned.has(id));
  const rest = current.filter((id) => !pinned.has(id));
  return [...top, ...rest];
}

// Moves for collectionReorderProducts, which applies them one after another:
// moving the k-th pinned product to position k builds the order above.
// Empty when the pinned products are already on top.
export function pinMoves(current: string[], pinned: Set<string>) {
  const top = current.filter((id) => pinned.has(id));
  const alreadyOnTop = top.every((id, index) => current[index] === id);
  if (alreadyOnTop) return [];
  return top.map((id, index) => ({ id, newPosition: String(index) }));
}

type CollectionProducts = {
  id: string;
  title: string;
  sortOrder: string;
  productIds: string[];
};

export type PinResult = {
  handle: string;
  status: 'missing' | 'not-manual' | 'unchanged' | 'reordered';
  moved?: number;
};

@Injectable()
export class CollectionPinService {
  private readonly logger = new Logger(CollectionPinService.name);

  constructor(private readonly shopifyService: ShopifyService) {}

  async pinDaVinciGames(): Promise<PinResult[]> {
    const source = await this.collectionProducts(PIN_SOURCE_HANDLE);
    if (!source) {
      this.logger.warn(`Collection ${PIN_SOURCE_HANDLE} not found`);
      return [];
    }
    const pinned = new Set(source.productIds);
    const results: PinResult[] = [];
    for (const handle of PIN_TARGET_HANDLES) {
      results.push(await this.pinIn(handle, pinned));
    }
    this.logger.log(`Da Vinci games pin: ${JSON.stringify(results)}`);
    return results;
  }

  private async pinIn(handle: string, pinned: Set<string>): Promise<PinResult> {
    const target = await this.collectionProducts(handle);
    if (!target) {
      this.logger.warn(`Collection ${handle} not found`);
      return { handle, status: 'missing' };
    }
    // Only a manual order can be changed; other sort orders are left alone.
    if (target.sortOrder !== 'MANUAL') {
      this.logger.warn(`${handle} is sorted ${target.sortOrder}, not MANUAL`);
      return { handle, status: 'not-manual' };
    }
    const moves = pinMoves(target.productIds, pinned);
    if (!moves.length) return { handle, status: 'unchanged' };

    await this.shopifyService.adminGraphQL(
      `mutation Reorder($id: ID!, $moves: [MoveInput!]!) {
        collectionReorderProducts(id: $id, moves: $moves) {
          job { id }
          userErrors { field message }
        }
      }`,
      { id: target.id, moves },
      'data.collectionReorderProducts.userErrors',
    );
    return { handle, status: 'reordered', moved: moves.length };
  }

  private async collectionProducts(
    handle: string,
  ): Promise<CollectionProducts | null> {
    let collection: CollectionProducts | null = null;
    let after: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await this.shopifyService.adminGraphQL<any>(
        `query CollectionProducts($handle: String!, $first: Int!, $after: String) {
          collectionByIdentifier(identifier: { handle: $handle }) {
            id
            title
            sortOrder
            products(first: $first, after: $after, sortKey: COLLECTION_DEFAULT) {
              nodes { id }
              pageInfo { hasNextPage endCursor }
            }
          }
        }`,
        { handle, first: PAGE_SIZE, after },
      );
      const node = data?.collectionByIdentifier;
      if (!node) return null;
      collection ??= {
        id: node.id,
        title: node.title,
        sortOrder: node.sortOrder,
        productIds: [],
      };
      node.products.nodes.forEach((p: { id: string }) =>
        collection.productIds.push(p.id),
      );
      if (!node.products.pageInfo.hasNextPage) break;
      after = node.products.pageInfo.endCursor;
    }
    return collection;
  }
}
