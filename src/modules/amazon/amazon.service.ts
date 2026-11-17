import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { findByBarcode } from 'src/lib/marketplace';
import { MenuService } from '../menu/menu.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { AmazonClient } from './amazon.client';
import {
  AMAZON_MARKETPLACE_ID,
  AmazonCatalogPage,
  AmazonFbaSummariesPage,
  AmazonFbaSummary,
  AmazonProduct,
} from './amazon.dto';

type MatchResult = {
  itemId: number;
  itemName: string;
  barcode?: string;
  amazonSku?: string;
  status: 'matched' | 'not_found' | 'no_barcode' | 'already_matched';
  matchedItemId?: number;
};

// Katalog araması tek istekte en fazla 20 ASIN alır.
const CATALOG_BATCH_SIZE = 20;

// Amazon'da stok FBA'dadır ve Amazon'ca yönetilir; buradan yalnızca okunur
// (karşılaştırma ve eşleştirme). Stok ya da fiyat gönderilmez.
@Injectable()
export class AmazonService {
  constructor(
    private readonly amazonClient: AmazonClient,
    @Inject(forwardRef(() => MenuService))
    private readonly menuService: MenuService,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  private async getFbaSummaries() {
    const summaries: AmazonFbaSummary[] = [];
    let nextToken: string | undefined;
    do {
      const page = await this.amazonClient.request<AmazonFbaSummariesPage>(
        'GET',
        '/fba/inventory/v1/summaries',
        {
          params: {
            details: true,
            granularityType: 'Marketplace',
            granularityId: AMAZON_MARKETPLACE_ID,
            marketplaceIds: AMAZON_MARKETPLACE_ID,
            ...(nextToken && { nextToken }),
          },
        },
      );
      summaries.push(...(page.payload?.inventorySummaries ?? []));
      nextToken = page.pagination?.nextToken;
    } while (nextToken);
    return summaries;
  }

  // ASIN → EAN. Katalog UPC de döndürebilir; yalnızca EAN alınır.
  private async getEansByAsin(asins: string[]): Promise<Map<string, string>> {
    const eans = new Map<string, string>();
    for (let i = 0; i < asins.length; i += CATALOG_BATCH_SIZE) {
      const page = await this.amazonClient.request<AmazonCatalogPage>(
        'GET',
        '/catalog/2022-04-01/items',
        {
          params: {
            marketplaceIds: AMAZON_MARKETPLACE_ID,
            identifiers: asins.slice(i, i + CATALOG_BATCH_SIZE).join(','),
            identifiersType: 'ASIN',
            includedData: 'identifiers',
            // Varsayılan sayfa 10 sonuçtur; 20'lik grubun tamamı tek sayfada gelsin.
            pageSize: CATALOG_BATCH_SIZE,
          },
          skipSuccessLog: () => true,
        },
      );
      for (const item of page.items ?? []) {
        const ean = item.identifiers
          ?.flatMap((entry) => entry.identifiers ?? [])
          .find((identifier) => identifier.identifierType === 'EAN');
        if (ean) eans.set(item.asin, ean.identifier);
      }
    }
    return eans;
  }

  // Stoğu olan ya da aktif ilanı olan FBA ürünleri; fiyat/stok karşılaştırması
  // ve eşleştirme bunu kullanır.
  async getAllProducts(): Promise<AmazonProduct[]> {
    const summaries = await this.getFbaSummaries();
    const withStock = summaries.filter((summary) => summary.totalQuantity);
    const eans = await this.getEansByAsin(withStock.map((s) => s.asin));
    return withStock.map((summary) => ({
      sellerSku: summary.sellerSku,
      asin: summary.asin,
      title: summary.productName,
      barcode: eans.get(summary.asin) ?? null,
      quantity: summary.inventoryDetails?.fulfillableQuantity ?? 0,
    }));
  }

  async matchItemsByBarcode(itemIds: number[]) {
    const [allItems, products] = await Promise.all([
      this.menuService.findAllItems(),
      this.getAllProducts(),
    ]);
    // Aynı barkodlu kopyalarda (Hasarlı ...) asıl ürün kazansın: önce küçük id işlenir.
    const targets = allItems
      .filter((item) => itemIds.includes(item._id as number))
      .sort((a, b) => (a._id as number) - (b._id as number));
    // Bir Amazon ürünü tek menü ürününe bağlanır; aynı barkodlu Hasarlı kopyalar
    // siparişleri yanlış ürüne yazmasın.
    const ownerBySku = new Map<string, number>();
    for (const item of allItems) {
      if (item.amazonSku && !item.deleted) {
        ownerBySku.set(item.amazonSku, item._id as number);
      }
    }
    const results: MatchResult[] = [];

    for (const item of targets) {
      const base = { itemId: item._id as number, itemName: item.name };
      if (!item.barcode) {
        results.push({ ...base, status: 'no_barcode' });
        continue;
      }
      const product = findByBarcode(
        products.filter((p) => p.barcode),
        item.barcode,
        (p) => p.barcode === item.barcode,
      );
      if (!product) {
        results.push({ ...base, barcode: item.barcode, status: 'not_found' });
        continue;
      }
      const ownerId = ownerBySku.get(product.sellerSku);
      if (ownerId !== undefined && ownerId !== base.itemId) {
        results.push({
          ...base,
          barcode: item.barcode,
          amazonSku: product.sellerSku,
          status: 'already_matched',
          matchedItemId: ownerId,
        });
        continue;
      }
      await this.menuService.updateItemField(base.itemId, {
        amazonSku: product.sellerSku,
      });
      ownerBySku.set(product.sellerSku, base.itemId);
      results.push({
        ...base,
        barcode: item.barcode,
        amazonSku: product.sellerSku,
        status: 'matched',
      });
    }

    const count = (status: MatchResult['status']) =>
      results.filter((r) => r.status === status).length;
    // Menü listesi önbellekte tutulur; temizlenmezse panel eski listeyi gösterir.
    if (count('matched') > 0) {
      await this.websocketGateway.emitItemChanged();
    }
    return {
      total: targets.length,
      matched: count('matched'),
      notFound: count('not_found'),
      noBarcode: count('no_barcode'),
      alreadyMatched: count('already_matched'),
      results,
    };
  }
}
