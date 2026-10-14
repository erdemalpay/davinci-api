import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  findByBarcode,
  hasOnlinePrice,
  roundPrice,
  sumStockQuantity,
} from 'src/lib/marketplace';
import { AccountingService } from '../accounting/accounting.service';
import { MenuService } from '../menu/menu.service';
import { IdefixClient } from './idefix.client';
import {
  IDEFIX_VENDOR_ID,
  IdefixInventoryBatch,
  IdefixInventoryItem,
  IdefixPage,
  IdefixInventoryUpdate,
} from './idefix.dto';

type MatchResult = {
  itemId: number;
  itemName: string;
  barcode?: string;
  idefixBarcode?: string;
  status: 'matched' | 'not_found' | 'no_barcode' | 'already_matched';
  inventory?: 'sent' | 'no_online_price' | 'writes_disabled';
  matchedItemId?: number;
};

// idefix fiyatı = menünün online fiyatı (liste = satış). idefix stok ve fiyatı
// aynı istekte istediği için online fiyatı boş ürün hiç gönderilmez.
@Injectable()
export class IdefixService {
  private readonly logger = new Logger(IdefixService.name);
  private static readonly INVENTORY_PAGE_SIZE = 500;
  private static readonly INVENTORY_BATCH_SIZE = 200;
  private readonly OnlineStoreLocation = 6;

  constructor(
    private readonly idefixClient: IdefixClient,
    @Inject(forwardRef(() => MenuService))
    private readonly menuService: MenuService,
    @Inject(forwardRef(() => AccountingService))
    private readonly accountingService: AccountingService,
  ) {}

  // pool/list Excel'deki ilk değerleri döndürür; güncel stok/fiyat buradadır.
  async getAllProducts(): Promise<IdefixInventoryItem[]> {
    const items: IdefixInventoryItem[] = [];
    let page = 1;
    let pageCount = 1;
    while (page <= pageCount) {
      const data = await this.idefixClient.request<
        IdefixPage<IdefixInventoryItem>
      >('GET', `/pim/catalog/${IDEFIX_VENDOR_ID}/inventory/list`, {
        params: { page, limit: IdefixService.INVENTORY_PAGE_SIZE },
      });
      items.push(...(data.items ?? []));
      pageCount = data.pageCount ?? 0;
      page++;
    }
    return items;
  }

  getInventoryResult(batchId: string): Promise<IdefixInventoryBatch> {
    return this.idefixClient.request<IdefixInventoryBatch>(
      'GET',
      `/pim/catalog/${IDEFIX_VENDOR_ID}/inventory-result/${batchId}`,
    );
  }

  async updateStock(barcode: string, quantity: number) {
    const item = await this.findMenuItem(barcode);
    const [batchRequestId] = await this.sendInventoryBatches([
      this.inventoryUpdate(barcode, item.onlinePrice, quantity),
    ]);
    return { batchRequestId };
  }

  async updatePrice(barcode: string, price: number) {
    const item = await this.findMenuItem(barcode, {
      requireOnlinePrice: false,
    });
    const quantity = await this.getStoreStock(item.matchedProduct);
    const [batchRequestId] = await this.sendInventoryBatches([
      this.inventoryUpdate(barcode, price, quantity),
    ]);
    return { batchRequestId };
  }

  // Stok değişiminde çağrılır; fiyat menüdeki online fiyattır.
  async pushStock(
    barcode: string,
    quantity: number,
    onlinePrice: unknown,
  ): Promise<boolean> {
    if (!this.idefixClient.writesEnabled) return false;
    if (!hasOnlinePrice(onlinePrice)) return false;
    return this.pushSafely(barcode, () =>
      this.inventoryUpdate(barcode, onlinePrice, quantity),
    );
  }

  // Online fiyat değişiminde çağrılır; stok mağazanın güncel stoğudur.
  async pushPrice(
    barcode: string,
    price: number,
    matchedProduct: string,
  ): Promise<boolean> {
    if (!this.idefixClient.writesEnabled) return false;
    const quantity = await this.getStoreStock(matchedProduct);
    return this.pushSafely(barcode, () =>
      this.inventoryUpdate(barcode, price, quantity),
    );
  }

  updateAllStocks() {
    return this.syncAll(
      (update, current) =>
        update.inventoryQuantity !== current.inventoryQuantity,
    );
  }

  updateAllPrices() {
    return this.syncAll(
      (update, current) =>
        update.price !== current.price ||
        update.comparePrice !== current.comparePrice,
    );
  }

  async matchItemsByBarcode(itemIds: number[]) {
    const [allItems, inventory] = await Promise.all([
      this.menuService.findAllItems(),
      this.getAllProducts(),
    ]);
    const targets = allItems.filter((item) =>
      itemIds.includes(item._id as number),
    );
    // Bir idefix ürünü tek menü ürününe bağlanır; aynı barkodlu Hasarlı kopyalar
    // stoğu ve siparişleri yanlış ürüne yazmasın.
    const ownerByBarcode = new Map<string, number>();
    for (const item of allItems) {
      if (item.idefixBarcode && !item.deleted) {
        ownerByBarcode.set(item.idefixBarcode, item._id as number);
      }
    }
    const canWrite = this.idefixClient.writesEnabled;
    const results: MatchResult[] = [];
    const updates: IdefixInventoryUpdate[] = [];

    for (const item of targets) {
      const base = { itemId: item._id as number, itemName: item.name };
      if (!item.barcode) {
        results.push({ ...base, status: 'no_barcode' });
        continue;
      }
      const product = findByBarcode(inventory, item.barcode);
      if (!product) {
        results.push({ ...base, barcode: item.barcode, status: 'not_found' });
        continue;
      }
      const ownerId = ownerByBarcode.get(product.barcode);
      if (ownerId !== undefined && ownerId !== base.itemId) {
        results.push({
          ...base,
          barcode: item.barcode,
          idefixBarcode: product.barcode,
          status: 'already_matched',
          matchedItemId: ownerId,
        });
        continue;
      }

      await this.menuService.updateItemField(base.itemId, {
        idefixBarcode: product.barcode,
      });
      ownerByBarcode.set(product.barcode, base.itemId);

      let inventoryStatus: MatchResult['inventory'] = 'no_online_price';
      if (hasOnlinePrice(item.onlinePrice)) {
        if (canWrite) {
          updates.push(
            this.inventoryUpdate(
              product.barcode,
              item.onlinePrice,
              await this.getStoreStock(item.matchedProduct),
            ),
          );
          inventoryStatus = 'sent';
        } else {
          inventoryStatus = 'writes_disabled';
        }
      }
      results.push({
        ...base,
        barcode: item.barcode,
        idefixBarcode: product.barcode,
        status: 'matched',
        inventory: inventoryStatus,
      });
    }

    const batchRequestIds = updates.length
      ? await this.sendInventoryBatches(updates)
      : [];
    const count = (status: MatchResult['status']) =>
      results.filter((r) => r.status === status).length;

    return {
      total: targets.length,
      matched: count('matched'),
      notFound: count('not_found'),
      noBarcode: count('no_barcode'),
      alreadyMatched: count('already_matched'),
      batchRequestIds,
      results,
    };
  }

  // Stok ve fiyat birlikte gönderildiği için iki toplu işlem yalnızca
  // "neyin farklı olduğuna" bakarak ayrışır.
  private async syncAll(
    isChanged: (
      update: IdefixInventoryUpdate,
      current: IdefixInventoryItem,
    ) => boolean,
  ) {
    const [menuItems, inventory] = await Promise.all([
      this.menuService.findItemsWithIdefixBarcode(),
      this.getAllProducts(),
    ]);
    const inventoryMap = new Map(inventory.map((i) => [i.barcode, i]));
    const updates: IdefixInventoryUpdate[] = [];
    const noOnlinePrice: string[] = [];
    let skipped = 0;

    for (const item of menuItems) {
      const current = inventoryMap.get(item.idefixBarcode);
      if (!current) {
        skipped++;
        continue;
      }
      if (!hasOnlinePrice(item.onlinePrice)) {
        noOnlinePrice.push(item.name);
        skipped++;
        continue;
      }
      const update = this.inventoryUpdate(
        current.barcode,
        item.onlinePrice,
        await this.getStoreStock(item.matchedProduct),
      );
      if (isChanged(update, current)) updates.push(update);
    }

    const batchRequestIds = updates.length
      ? await this.sendInventoryBatches(updates)
      : [];
    return {
      total: menuItems.length,
      updated: updates.length,
      skipped,
      noOnlinePrice,
      batchRequestIds,
    };
  }

  private async findMenuItem(
    barcode: string,
    { requireOnlinePrice = true } = {},
  ) {
    const item = await this.menuService.findByIdefixBarcode(barcode);
    if (!item) {
      throw new HttpException(
        `No menu item matched to idefix barcode ${barcode}`,
        HttpStatus.NOT_FOUND,
      );
    }
    if (requireOnlinePrice && !hasOnlinePrice(item.onlinePrice)) {
      throw new HttpException(
        `${item.name} has no online price; idefix needs price with stock`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return item;
  }

  private async pushSafely(
    barcode: string,
    build: () => IdefixInventoryUpdate,
  ): Promise<boolean> {
    try {
      await this.sendInventoryBatches([build()]);
      return true;
    } catch (error) {
      this.logger.error(
        `idefix inventory push failed for ${barcode}: ${
          error?.message || error
        }`,
      );
      return false;
    }
  }

  private inventoryUpdate(
    barcode: string,
    price: number,
    quantity: number,
  ): IdefixInventoryUpdate {
    const value = roundPrice(price);
    return {
      barcode,
      price: value,
      comparePrice: value,
      inventoryQuantity: Math.max(0, Math.floor(quantity)),
    };
  }

  private async getStoreStock(matchedProduct: string): Promise<number> {
    const stocks = await this.accountingService.findProductStockByLocation(
      matchedProduct,
      this.OnlineStoreLocation,
    );
    return sumStockQuantity(stocks);
  }

  private async sendInventoryBatches(
    updates: IdefixInventoryUpdate[],
  ): Promise<string[]> {
    this.idefixClient.assertWritesEnabled();
    const batchRequestIds: string[] = [];
    for (
      let i = 0;
      i < updates.length;
      i += IdefixService.INVENTORY_BATCH_SIZE
    ) {
      const items = updates.slice(i, i + IdefixService.INVENTORY_BATCH_SIZE);
      const data = await this.idefixClient.request<IdefixInventoryBatch>(
        'POST',
        `/pim/catalog/${IDEFIX_VENDOR_ID}/inventory-upload`,
        { body: { items } },
      );
      if (data.status === 'FAILED') {
        throw new HttpException(
          `idefix inventory batch ${data.batchRequestId} failed`,
          HttpStatus.BAD_REQUEST,
        );
      }
      batchRequestIds.push(data.batchRequestId);
    }
    return batchRequestIds;
  }
}
