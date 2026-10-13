import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AccountingService } from '../accounting/accounting.service';
import { MenuService } from '../menu/menu.service';
import { N11Client } from './n11.client';
import {
  N11Product,
  N11ProductPage,
  N11SkuUpdate,
  N11TaskDetail,
  N11TaskResponse,
} from './n11.dto';
import { findN11ProductByBarcode, toN11Price } from './n11.mappers';

type MatchResult = {
  itemId: number;
  itemName: string;
  barcode?: string;
  stockCode?: string;
  status: 'matched' | 'not_found' | 'no_barcode' | 'already_matched';
  price?: 'sent' | 'no_online_price' | 'writes_disabled';
  matchedItemId?: number;
};

// n11 fiyatı = menünün online fiyatı (liste = satış); online fiyat boşsa dokunulmaz.
@Injectable()
export class N11Service {
  private readonly logger = new Logger(N11Service.name);
  private static readonly PRODUCT_PAGE_SIZE = 250;
  private static readonly SKU_BATCH_SIZE = 1000;
  private readonly OnlineStoreLocation = 6;

  constructor(
    private readonly n11Client: N11Client,
    @Inject(forwardRef(() => MenuService))
    private readonly menuService: MenuService,
    @Inject(forwardRef(() => AccountingService))
    private readonly accountingService: AccountingService,
  ) {}

  async getAllProducts(): Promise<N11Product[]> {
    const products: N11Product[] = [];
    let page = 0;
    let totalPages = 1;
    while (page < totalPages) {
      const data = await this.n11Client.request<N11ProductPage>(
        'GET',
        '/ms/product-query',
        { params: { page, size: N11Service.PRODUCT_PAGE_SIZE } },
      );
      products.push(...(data.content ?? []));
      totalPages = data.totalPages ?? 0;
      page++;
    }
    return products;
  }

  getTaskDetail(taskId: number): Promise<N11TaskDetail> {
    return this.n11Client.request<N11TaskDetail>(
      'POST',
      '/ms/product/task-details/page-query',
      { body: { taskId, pageable: { page: 0, size: 1000 } } },
    );
  }

  async updateStock(stockCode: string, quantity: number) {
    const [taskId] = await this.sendSkuBatches([
      this.stockSku(stockCode, quantity),
    ]);
    return { taskId };
  }

  async updatePrice(stockCode: string, price: number) {
    const [taskId] = await this.sendSkuBatches([
      this.priceSku(stockCode, price),
    ]);
    return { taskId };
  }

  async pushStock(stockCode: string, quantity: number): Promise<boolean> {
    if (!this.n11Client.writesEnabled) return false;
    try {
      await this.sendSkuBatches([this.stockSku(stockCode, quantity)]);
      return true;
    } catch (error) {
      this.logger.error(
        `n11 stock push failed for ${stockCode}: ${error?.message || error}`,
      );
      return false;
    }
  }

  async pushPrice(stockCode: string, price: number): Promise<boolean> {
    if (!this.n11Client.writesEnabled) return false;
    try {
      await this.sendSkuBatches([this.priceSku(stockCode, price)]);
      return true;
    } catch (error) {
      this.logger.error(
        `n11 price push failed for ${stockCode}: ${error?.message || error}`,
      );
      return false;
    }
  }

  async updateAllStocks() {
    const [menuItems, products] = await Promise.all([
      this.menuService.findItemsWithN11StockCode(),
      this.getAllProducts(),
    ]);
    const productMap = new Map(products.map((p) => [p.stockCode, p]));
    const skus: N11SkuUpdate[] = [];
    let skipped = 0;

    for (const item of menuItems) {
      const product = productMap.get(item.n11StockCode);
      if (!product) {
        skipped++;
        continue;
      }
      const sku = this.stockSku(
        product.stockCode,
        await this.getStoreStock(item.matchedProduct),
      );
      if (sku.quantity !== product.quantity) skus.push(sku);
    }

    const taskIds = skus.length ? await this.sendSkuBatches(skus) : [];
    return { total: menuItems.length, updated: skus.length, skipped, taskIds };
  }

  async updateAllPrices() {
    const [menuItems, products] = await Promise.all([
      this.menuService.findItemsWithN11StockCode(),
      this.getAllProducts(),
    ]);
    const productMap = new Map(products.map((p) => [p.stockCode, p]));
    const skus: N11SkuUpdate[] = [];
    const noOnlinePrice: string[] = [];
    let skipped = 0;

    for (const item of menuItems) {
      const product = productMap.get(item.n11StockCode);
      if (!product) {
        skipped++;
        continue;
      }
      if (!this.hasOnlinePrice(item.onlinePrice)) {
        noOnlinePrice.push(item.name);
        skipped++;
        continue;
      }
      const sku = this.priceSku(product.stockCode, item.onlinePrice);
      if (
        sku.salePrice !== product.salePrice ||
        sku.listPrice !== product.listPrice
      ) {
        skus.push(sku);
      }
    }

    const taskIds = skus.length ? await this.sendSkuBatches(skus) : [];
    return {
      total: menuItems.length,
      updated: skus.length,
      skipped,
      noOnlinePrice,
      taskIds,
    };
  }

  // n11 barkodla arama sunmadığı için ürün listesi bir kez çekilip içinde aranır.
  async matchItemsByBarcode(itemIds: number[]) {
    const [allItems, products] = await Promise.all([
      this.menuService.findAllItems(),
      this.getAllProducts(),
    ]);
    const targets = allItems.filter((item) =>
      itemIds.includes(item._id as number),
    );
    // Bir n11 ürünü tek menü ürününe bağlanır; aynı barkodlu Hasarlı kopyalar
    // stoğu ve siparişleri yanlış ürüne yazmasın.
    const ownerByStockCode = new Map<string, number>();
    for (const item of allItems) {
      if (item.n11StockCode && !item.deleted) {
        ownerByStockCode.set(item.n11StockCode, item._id as number);
      }
    }
    const canWrite = this.n11Client.writesEnabled;
    const results: MatchResult[] = [];
    const priceSkus: N11SkuUpdate[] = [];

    for (const item of targets) {
      const base = { itemId: item._id as number, itemName: item.name };
      if (!item.barcode) {
        results.push({ ...base, status: 'no_barcode' });
        continue;
      }
      const product = findN11ProductByBarcode(products, item.barcode);
      if (!product) {
        results.push({ ...base, barcode: item.barcode, status: 'not_found' });
        continue;
      }
      const ownerId = ownerByStockCode.get(product.stockCode);
      if (ownerId !== undefined && ownerId !== base.itemId) {
        results.push({
          ...base,
          barcode: item.barcode,
          stockCode: product.stockCode,
          status: 'already_matched',
          matchedItemId: ownerId,
        });
        continue;
      }

      await this.menuService.updateItemField(base.itemId, {
        n11StockCode: product.stockCode,
      });
      ownerByStockCode.set(product.stockCode, base.itemId);

      let price: MatchResult['price'] = 'no_online_price';
      if (this.hasOnlinePrice(item.onlinePrice)) {
        if (canWrite) {
          priceSkus.push(this.priceSku(product.stockCode, item.onlinePrice));
          price = 'sent';
        } else {
          price = 'writes_disabled';
        }
      }
      results.push({
        ...base,
        barcode: item.barcode,
        stockCode: product.stockCode,
        status: 'matched',
        price,
      });
    }

    const taskIds = priceSkus.length
      ? await this.sendSkuBatches(priceSkus)
      : [];
    const count = (status: MatchResult['status']) =>
      results.filter((r) => r.status === status).length;

    return {
      total: targets.length,
      matched: count('matched'),
      notFound: count('not_found'),
      noBarcode: count('no_barcode'),
      alreadyMatched: count('already_matched'),
      taskIds,
      results,
    };
  }

  private hasOnlinePrice(value: unknown): value is number {
    return typeof value === 'number' && value > 0;
  }

  private stockSku(stockCode: string, quantity: number): N11SkuUpdate {
    return { stockCode, quantity: Math.max(0, Math.floor(quantity)) };
  }

  private priceSku(stockCode: string, price: number): N11SkuUpdate {
    const value = toN11Price(price);
    return { stockCode, listPrice: value, salePrice: value };
  }

  private async getStoreStock(matchedProduct: string): Promise<number> {
    const stocks = await this.accountingService.findProductStockByLocation(
      matchedProduct,
      this.OnlineStoreLocation,
    );
    return stocks.reduce((total, stock) => total + (stock.quantity || 0), 0);
  }

  private async sendSkuBatches(skus: N11SkuUpdate[]): Promise<number[]> {
    this.n11Client.assertWritesEnabled();
    const taskIds: number[] = [];
    for (let i = 0; i < skus.length; i += N11Service.SKU_BATCH_SIZE) {
      const batch = skus.slice(i, i + N11Service.SKU_BATCH_SIZE);
      const data = await this.n11Client.request<N11TaskResponse>(
        'POST',
        '/ms/product/tasks/price-stock-update',
        {
          body: {
            payload: { integrator: this.n11Client.integrator, skus: batch },
          },
        },
      );
      if (data.status === 'REJECT') {
        throw new HttpException(
          `n11 task rejected: ${(data.reasons ?? []).join(', ')}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      taskIds.push(data.id);
    }
    return taskIds;
  }
}
