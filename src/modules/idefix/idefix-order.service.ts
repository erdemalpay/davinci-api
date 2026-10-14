import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { StockHistoryStatusEnum } from '../accounting/accounting.dto';
import { ReservedStockEntry } from '../accounting/count.schema';
import { MenuService } from '../menu/menu.service';
import {
  MarketplaceOrderLine,
  MarketplaceOrderSync,
} from '../order/marketplace-order-sync';
import { OrderStatus } from '../order/order.dto';
import { OrderService } from '../order/order.service';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { UserService } from '../user/user.service';
import { WebhookSource } from '../webhook-log/webhook-log.schema';
import { WebhookLogService } from '../webhook-log/webhook-log.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { IdefixClient } from './idefix.client';
import {
  IDEFIX_VENDOR_ID,
  IdefixClaim,
  IdefixPage,
  IdefixShipment,
  IdefixShipmentItem,
} from './idefix.dto';
import {
  formatIdefixDate,
  IDEFIX_RESERVED_STATUSES,
  planShipmentActions,
  shipmentCreatedAt,
  toUnitPrice,
} from './idefix.mappers';

const DAY_MS = 24 * 60 * 60 * 1000;

// idefix webhook göndermediği için siparişler polling ile çekilir.
@Injectable()
export class IdefixOrderService extends MarketplaceOrderSync {
  protected readonly webhookSource = WebhookSource.IDEFIX;
  private static readonly PAGE_SIZE = 100;
  // Saat dilimi yorumu ve gecikmeler için; tekrar işleme zararsız.
  private static readonly CURSOR_OVERLAP_MS = 4 * 60 * 60 * 1000;
  private static readonly FIRST_RUN_LOOKBACK_MS = 60 * 60 * 1000;
  private static readonly RESERVED_LOOKBACK_MS = 14 * DAY_MS;
  private static readonly CLAIM_LOOKBACK_MS = 30 * DAY_MS;

  // Hem sipariş iptali hem iade aynı satır id'si üzerinden iptal eder.
  private readonly lineHandlers = {
    find: (id: string) => this.orderService.findByIdefixLineItemId(id),
    cancel: (user: any, id: string, quantity: number) =>
      this.orderService.cancelIdefixOrder(user, id, quantity),
  };

  constructor(
    private readonly idefixClient: IdefixClient,
    @Inject(forwardRef(() => OrderService))
    orderService: OrderService,
    @Inject(forwardRef(() => MenuService))
    private readonly menuService: MenuService,
    @Inject(forwardRef(() => UserService))
    userService: UserService,
    webhookLogService: WebhookLogService,
    websocketGateway: AppWebSocketGateway,
    redisService: RedisService,
  ) {
    super(
      orderService,
      userService,
      webhookLogService,
      websocketGateway,
      redisService,
    );
  }

  private async getAllPages<T>(
    path: string,
    params: Record<string, any>,
  ): Promise<T[]> {
    const items: T[] = [];
    let page = 1;
    let pageCount = 1;
    while (page <= pageCount) {
      const data = await this.idefixClient.request<IdefixPage<T>>('GET', path, {
        params: { ...params, page, limit: IdefixOrderService.PAGE_SIZE },
        skipSuccessLog: (d) => !d?.items?.length,
      });
      items.push(...(data.items ?? []));
      pageCount = data.pageCount ?? 0;
      page++;
    }
    return items;
  }

  getShipments(params: Record<string, any>): Promise<IdefixShipment[]> {
    return this.getAllPages<IdefixShipment>(
      `/oms/${IDEFIX_VENDOR_ID}/list`,
      params,
    );
  }

  syncOrders() {
    return this.runCursorSync(
      {
        cursorKey: RedisKeys.IdefixOrderSyncCursor,
        overlapMs: IdefixOrderService.CURSOR_OVERLAP_MS,
        firstRunLookbackMs: IdefixOrderService.FIRST_RUN_LOOKBACK_MS,
      },
      async (since) => {
        const shipments = await this.getShipments({
          lastUpdatedAt: formatIdefixDate(new Date(since)),
          sortByField: 'updateAt',
          sortDirection: 'asc',
        });

        const { creates, cancelLineItemIds } = planShipmentActions(shipments);
        const user = await this.getConstantUser();

        // Önce oluştur, sonra iptal et: tedarik edilemedi bildiriminde stok
        // geçici olarak fazla görünüp diğer kanallarda fazla satış açılmasın.
        let created = 0;
        for (const { shipment, items } of creates) {
          created += await this.createShipmentOrders(user, shipment, items);
        }
        const cancelled = await this.cancelLines(
          user,
          cancelLineItemIds,
          this.lineHandlers,
        );
        return { shipments: shipments.length, created, cancelled };
      },
    );
  }

  // Liste her kalemi 1 adet döndürür; her kalem 1 adetlik sipariştir.
  private async createShipmentOrders(
    user: any,
    shipment: IdefixShipment,
    items: IdefixShipmentItem[],
  ): Promise<number> {
    const matched: MarketplaceOrderLine[] = [];
    const newlyUnmatched: string[] = [];
    const shipmentId = String(shipment.id);

    for (const item of items) {
      const lineItemId = String(item.id);
      if (await this.orderService.findByIdefixLineItemId(lineItemId)) continue;

      const menuItem = await this.menuService.findByIdefixBarcode(item.barcode);
      if (!menuItem?.matchedProduct) {
        if (this.markUnmatchedLine(lineItemId)) {
          newlyUnmatched.push(item.barcode);
        }
        continue;
      }
      const unitPrice = toUnitPrice(item);
      matched.push({
        lineItemId,
        paidQuantity: 1,
        amount: unitPrice,
        dto: {
          item: menuItem._id,
          quantity: 1,
          note: '',
          discount: undefined,
          discountNote: '',
          isOnlinePrice: false,
          location: this.OnlineStoreLocation,
          unitPrice,
          paidQuantity: 0,
          status: OrderStatus.AUTOSERVED,
          stockLocation: this.OnlineStoreStockLocation,
          createdAt: shipmentCreatedAt(shipment),
          tableDate: new Date(),
          createdBy: user._id,
          stockNote: StockHistoryStatusEnum.IDEFIXORDERCREATE,
          paymentMethod: 'idefix',
          isOnlineSale: true,
          idefixOrderNumber: String(shipment.orderNumber),
          idefixShipmentId: shipmentId,
          idefixLineItemId: lineItemId,
        },
      });
    }
    if (matched.length === 0 && newlyUnmatched.length === 0) return 0;

    return this.createPackageOrders(
      user,
      {
        payload: shipment,
        referenceId: shipmentId,
        collection: {
          idefixOrderNumber: String(shipment.orderNumber),
          idefixShipmentId: shipmentId,
        },
      },
      matched,
      { key: 'unmatchedBarcodes', label: 'barcode', values: newlyUnmatched },
    );
  }

  // idefix state filtresi tek değer alıyor; her statü ayrı sorgulanır.
  async getReservedStocks(
    stockLocation: number,
  ): Promise<ReservedStockEntry[]> {
    const startDate = formatIdefixDate(
      new Date(Date.now() - IdefixOrderService.RESERVED_LOOKBACK_MS),
    );
    const orderNumberByLineId = new Map<string, string>();

    for (const state of IDEFIX_RESERVED_STATUSES) {
      const shipments = await this.getShipments({ state, startDate });
      for (const shipment of shipments) {
        for (const item of shipment.items ?? []) {
          orderNumberByLineId.set(
            String(item.id),
            String(shipment.orderNumber),
          );
        }
      }
    }
    return this.toReservedEntries(
      orderNumberByLineId,
      stockLocation,
      'idefix',
      (ids) => this.orderService.findByIdefixLineItemIds(ids),
      (order) => String(order.idefixLineItemId),
    );
  }

  getClaims(params: Record<string, any>): Promise<IdefixClaim[]> {
    return this.getAllPages<IdefixClaim>(
      `/oms/${IDEFIX_VENDOR_ID}/claim-list`,
      params,
    );
  }

  // İade satırı sevkiyattaki kalemin id'sini (orderLineId) taşır; onaylanan
  // iadenin siparişi doğrudan bulunup iptal edilir, stok geri alınır.
  async processAcceptedClaims() {
    const claims = await this.getClaims({
      lastUpdatedAt: formatIdefixDate(
        new Date(Date.now() - IdefixOrderService.CLAIM_LOOKBACK_MS),
      ),
    });
    const approvedLineIds = [
      ...new Set(
        claims.flatMap((claim) =>
          (claim.items ?? [])
            .filter((item) => item.state === 'approved')
            .map((item) => String(item.orderLineId)),
        ),
      ),
    ];
    const user = await this.getConstantUser();
    const cancelled = await this.cancelLines(
      user,
      approvedLineIds,
      this.lineHandlers,
      'claim-approved',
    );

    if (cancelled > 0) {
      this.websocketGateway.emitOrderGroupChanged();
    }
    return {
      success: true,
      message: 'idefix approved claims processing completed',
      stats: {
        totalClaimsChecked: claims.length,
        approvedLines: approvedLineIds.length,
        cancelled,
        // Daha önce iptal edilmiş ya da panelde bulunmayan satırlar.
        skipped: approvedLineIds.length - cancelled,
      },
    };
  }
}
