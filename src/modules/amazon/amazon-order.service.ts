import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AccountingService } from '../accounting/accounting.service';
import { StockHistoryStatusEnum } from '../accounting/accounting.dto';
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
import { AmazonClient } from './amazon.client';
import {
  AMAZON_LOST_STOCK_LOCATION,
  AMAZON_MARKETPLACE_ID,
  AMAZON_RETURNS_REPORT,
  AMAZON_STOCK_LOCATION,
  AmazonOrder,
  AmazonOrdersPage,
  AmazonReturnRow,
} from './amazon.dto';
import {
  isSellableReturn,
  orderCreatedAt,
  parseReturnRows,
  planOrderActions,
  returnKey,
  toUnitPrice,
} from './amazon.mappers';
import { ProcessedAmazonReturn } from './processed-amazon-return.schema';

// Amazon webhook yerine bildirim kuyruğu (SQS) ister; siparişler polling ile
// çekilir. searchOrders yaklaşık 3 dakikada 1 istek izin verir.
@Injectable()
export class AmazonOrderService extends MarketplaceOrderSync {
  protected readonly webhookSource = WebhookSource.AMAZON;
  private static readonly PAGE_SIZE = 100;
  // Gecikmeli güncellemeler için; tekrar işleme zararsız.
  private static readonly CURSOR_OVERLAP_MS = 30 * 60 * 1000;
  // Entegrasyon açıldığında geçmiş siparişler stoktan düşülmesin.
  private static readonly FIRST_RUN_LOOKBACK_MS = 60 * 60 * 1000;
  // İade raporu en fazla 60 gün sorulabilir; tekrar işleme kayıt tablosuyla engellenir.
  private static readonly RETURN_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly amazonClient: AmazonClient,
    @Inject(forwardRef(() => OrderService))
    orderService: OrderService,
    @Inject(forwardRef(() => MenuService))
    private readonly menuService: MenuService,
    @Inject(forwardRef(() => UserService))
    userService: UserService,
    webhookLogService: WebhookLogService,
    websocketGateway: AppWebSocketGateway,
    redisService: RedisService,
    @Inject(forwardRef(() => AccountingService))
    private readonly accountingService: AccountingService,
    @InjectModel(ProcessedAmazonReturn.name)
    private readonly processedReturnModel: Model<ProcessedAmazonReturn>,
  ) {
    super(
      orderService,
      userService,
      webhookLogService,
      websocketGateway,
      redisService,
    );
  }

  async getOrders(lastUpdatedAfter: Date): Promise<AmazonOrder[]> {
    const orders: AmazonOrder[] = [];
    let paginationToken: string | undefined;
    do {
      const page = await this.amazonClient.request<AmazonOrdersPage>(
        'GET',
        '/orders/2026-01-01/orders',
        {
          params: {
            marketplaceIds: AMAZON_MARKETPLACE_ID,
            lastUpdatedAfter: lastUpdatedAfter.toISOString(),
            includedData: 'FULFILLMENT',
            maxResultsPerPage: AmazonOrderService.PAGE_SIZE,
            ...(paginationToken && { paginationToken }),
          },
          skipSuccessLog: (data) => !data?.orders?.length,
        },
      );
      orders.push(...(page.orders ?? []));
      paginationToken = page.orders?.length
        ? page.pagination?.nextToken
        : undefined;
    } while (paginationToken);
    return orders;
  }

  syncOrders() {
    return this.runCursorSync(
      {
        cursorKey: RedisKeys.AmazonOrderSyncCursor,
        overlapMs: AmazonOrderService.CURSOR_OVERLAP_MS,
        firstRunLookbackMs: AmazonOrderService.FIRST_RUN_LOOKBACK_MS,
      },
      async (since) => {
        const orders = await this.getOrders(new Date(since));
        const { creates, cancelLineItemIds } = planOrderActions(orders);
        const user = await this.getConstantUser();

        // Önce oluştur, sonra iptal et: stok geçici olarak fazla görünüp
        // diğer kanallarda fazla satış açılmasın.
        let created = 0;
        for (const order of creates) {
          created += await this.createAmazonOrders(user, order);
        }
        const cancelled = await this.cancelLines(user, cancelLineItemIds, {
          find: (id) => this.orderService.findByAmazonLineItemId(id),
          cancel: (u, id, quantity) =>
            this.orderService.cancelAmazonOrder(u, id, quantity),
        });
        return { orders: orders.length, created, cancelled };
      },
    );
  }

  private async createAmazonOrders(
    user: any,
    order: AmazonOrder,
  ): Promise<number> {
    const matched: MarketplaceOrderLine[] = [];
    const newlyUnmatched: string[] = [];

    for (const item of order.orderItems ?? []) {
      const lineItemId = item.orderItemId;
      if (await this.orderService.findByAmazonLineItemId(lineItemId)) continue;

      const sellerSku = item.product?.sellerSku ?? '';
      const menuItem = sellerSku
        ? await this.menuService.findByAmazonSku(sellerSku)
        : null;
      const unitPrice = toUnitPrice(item);
      if (!menuItem?.matchedProduct || unitPrice === null) {
        if (this.markUnmatchedLine(lineItemId)) {
          newlyUnmatched.push(sellerSku || lineItemId);
        }
        continue;
      }
      matched.push({
        lineItemId,
        paidQuantity: item.quantityOrdered,
        amount: unitPrice * item.quantityOrdered,
        dto: {
          item: menuItem._id,
          quantity: item.quantityOrdered,
          note: '',
          discount: undefined,
          discountNote: '',
          isOnlinePrice: false,
          location: this.OnlineStoreLocation,
          unitPrice,
          paidQuantity: 0,
          status: OrderStatus.AUTOSERVED,
          stockLocation: AMAZON_STOCK_LOCATION,
          createdAt: orderCreatedAt(order),
          tableDate: new Date(),
          createdBy: user._id,
          stockNote: StockHistoryStatusEnum.AMAZONORDERCREATE,
          paymentMethod: 'amazon',
          isOnlineSale: true,
          amazonOrderNumber: order.orderId,
          amazonLineItemId: lineItemId,
        },
      });
    }
    if (matched.length === 0 && newlyUnmatched.length === 0) return 0;

    return this.createPackageOrders(
      user,
      {
        payload: order,
        referenceId: order.orderId,
        collection: { amazonOrderNumber: order.orderId },
      },
      matched,
      { key: 'unmatchedSkus', label: 'sellerSku', values: newlyUnmatched },
    );
  }

  // Amazon iadeyi depoda teslim alınca bildirir; sipariş durumu değişmez, bu
  // yüzden iade raporu okunur. İade edilen adet kadar sipariş iptal edilir
  // (stok Amazon konumuna döner, gelir düşer). Satılamaz iade ayrıca
  // Kayıplar konumuna aktarılır.
  async processAcceptedClaims() {
    const end = new Date();
    const report = await this.amazonClient.getReport(
      AMAZON_RETURNS_REPORT,
      new Date(end.getTime() - AmazonOrderService.RETURN_LOOKBACK_MS),
      end,
    );
    const rows = parseReturnRows(report);
    const user = await this.getConstantUser();
    let skipped = 0;
    let cancelled = 0;
    let movedToLost = 0;
    let notFound = 0;
    let errors = 0;

    for (const row of rows) {
      const key = returnKey(row);
      try {
        if (await this.processedReturnModel.exists({ returnKey: key })) {
          skipped++;
          continue;
        }
        const menuItem = await this.menuService.findByAmazonSku(row.sku);
        const cancelledQuantity = menuItem
          ? await this.cancelReturnedOrders(user, row, menuItem._id)
          : 0;
        let action = 'CANCELLED';
        let errorMessage: string | undefined;
        if (cancelledQuantity === 0) {
          action = 'ORDER_NOT_FOUND';
          notFound++;
        } else {
          cancelled += cancelledQuantity;
          if (!isSellableReturn(row)) {
            try {
              await this.accountingService.stockTransfer(
                user,
                AMAZON_STOCK_LOCATION,
                AMAZON_LOST_STOCK_LOCATION,
                menuItem.matchedProduct,
                cancelledQuantity,
              );
              action = 'CANCELLED_TO_LOST';
              movedToLost += cancelledQuantity;
            } catch (error) {
              // Sipariş iptal edildi; tekrar denenirse fazla iptal olur.
              errors++;
              errorMessage = error?.message;
              this.logger.error(
                `Error moving amazon return ${key} to lost stock`,
                error,
              );
            }
          }
        }
        await this.processedReturnModel.create({
          returnKey: key,
          orderNumber: row.orderId,
          sku: row.sku,
          quantity: row.quantity,
          disposition: row.disposition,
          action,
          success: !errorMessage,
          errorMessage,
          processedAt: new Date(),
        });
      } catch (error) {
        errors++;
        this.logger.error(`Error processing amazon return ${key}`, error);
      }
    }

    if (cancelled > 0) {
      this.websocketGateway.emitOrderGroupChanged();
    }
    return {
      success: true,
      message: 'amazon returns processing completed',
      stats: {
        totalReturnsChecked: rows.length,
        skipped,
        cancelled,
        movedToLost,
        notFound,
        errors,
      },
    };
  }

  // İade adedi, o siparişin ürün satırlarına sırayla dağıtılır.
  private async cancelReturnedOrders(
    user: any,
    row: AmazonReturnRow,
    itemId: number,
  ): Promise<number> {
    const orders =
      await this.orderService.findActiveAmazonOrdersByOrderNumberAndItem(
        row.orderId,
        itemId,
      );
    let remaining = row.quantity;
    for (const order of orders) {
      if (remaining <= 0) break;
      const quantity = Math.min(remaining, order.quantity);
      await this.orderService.cancelAmazonOrder(
        user,
        order.amazonLineItemId,
        quantity,
      );
      remaining -= quantity;
    }
    return row.quantity - remaining;
  }
}
