import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { isOrderOnShelf, toReservedStockEntries } from 'src/lib/mappers';
import {
  ReservedStockDetail,
  ReservedStockEntry,
} from '../accounting/count.schema';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { UserService } from '../user/user.service';
import {
  WebhookSource,
  WebhookStatus,
} from '../webhook-log/webhook-log.schema';
import { WebhookLogService } from '../webhook-log/webhook-log.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import {
  CreateCollectionDto,
  CreateOrderDto,
  OrderCollectionStatus,
  OrderStatus,
} from './order.dto';
import { Order } from './order.schema';
import { OrderService } from './order.service';

export type MarketplaceOrderLine = {
  lineItemId: string;
  dto: CreateOrderDto;
  paidQuantity: number;
  amount: number;
};

type LineOrderHandlers = {
  find: (lineItemId: string) => Promise<Order | null>;
  cancel: (user: any, lineItemId: string, quantity: number) => Promise<any>;
};

// Webhook göndermeyen pazaryerlerinin (n11, idefix) polling ile sipariş
// senkronunun ortak iskeleti: cursor, sipariş/tahsilat açma, iptal, ayrılmış
// stok ve webhook kaydı. Pazaryerine özgü sorgu ve eşleme alt sınıftadır.
export abstract class MarketplaceOrderSync {
  protected readonly logger = new Logger(this.constructor.name);
  protected readonly OnlineStoreLocation = 4;
  protected readonly OnlineStoreStockLocation = 6;
  private static readonly MAX_REPORTED_UNMATCHED_LINES = 1000;

  protected abstract readonly webhookSource: WebhookSource;

  private isSyncing = false;
  // Eşleşmeyen satırlar her turda tekrar loglanmasın.
  private readonly reportedUnmatchedLines = new Set<string>();

  constructor(
    protected readonly orderService: OrderService,
    protected readonly userService: UserService,
    protected readonly webhookLogService: WebhookLogService,
    protected readonly websocketGateway: AppWebSocketGateway,
    protected readonly redisService: RedisService,
  ) {}

  // Aynı anda ikinci tur atlanır; cursor yalnızca başarılı turda ilerler ve
  // geri bindirme ile sorulur, tekrar işleme zararsızdır.
  protected async runCursorSync<
    R extends { created: number; cancelled: number },
  >(
    options: {
      cursorKey: RedisKeys;
      overlapMs: number;
      firstRunLookbackMs: number;
    },
    work: (since: number) => Promise<R>,
  ): Promise<{ skipped: true } | ({ skipped: false } & R)> {
    if (this.isSyncing) {
      return { skipped: true };
    }
    this.isSyncing = true;
    const startedAt = Date.now();

    try {
      const cursor: number | null = await this.redisService.get(
        options.cursorKey,
      );
      const since = cursor
        ? cursor - options.overlapMs
        : startedAt - options.firstRunLookbackMs;
      const result = await work(since);

      await this.redisService.set(options.cursorKey, startedAt);

      if (result.created > 0 || result.cancelled > 0) {
        this.websocketGateway.emitOrderGroupChanged();
      }
      return { skipped: false, ...result };
    } finally {
      this.isSyncing = false;
    }
  }

  // Satır ilk kez eşleşmediyse true döner (loglanacak).
  protected markUnmatchedLine(lineItemId: string): boolean {
    if (this.reportedUnmatchedLines.has(lineItemId)) return false;
    // Uygulama açık kaldıkça büyümesin; temizlenirse en fazla bir kez daha loglanır.
    if (
      this.reportedUnmatchedLines.size >=
      MarketplaceOrderSync.MAX_REPORTED_UNMATCHED_LINES
    ) {
      this.reportedUnmatchedLines.clear();
    }
    this.reportedUnmatchedLines.add(lineItemId);
    return true;
  }

  // Satırların siparişlerini ve paket başına tek tahsilatı açar, sonucu
  // webhook kaydına yazar. Açılan sipariş sayısını döner.
  protected async createPackageOrders(
    user: any,
    pkg: {
      payload: any;
      referenceId?: string;
      collection: Partial<CreateCollectionDto>;
    },
    lines: MarketplaceOrderLine[],
    unmatched: { key: string; label: string; values: string[] },
  ): Promise<number> {
    const startTime = Date.now();
    const webhookLog = await this.webhookLogService.logWebhookRequest(
      this.webhookSource,
      'order-sync',
      pkg.payload,
    );

    try {
      const createdOrders: Array<{
        order: number;
        paidQuantity: number;
        amount: number;
      }> = [];
      for (const line of lines) {
        try {
          const order = await this.orderService.createOrder(user, line.dto);
          createdOrders.push({
            order: order._id,
            paidQuantity: line.paidQuantity,
            amount: line.amount,
          });
        } catch (orderError) {
          this.logger.error(
            `Error creating ${this.webhookSource} order for line ${line.lineItemId}`,
            orderError,
          );
        }
      }

      if (createdOrders.length > 0) {
        await this.orderService.createCollection(user, {
          location: this.OnlineStoreLocation,
          paymentMethod: this.webhookSource,
          amount: createdOrders.reduce((sum, o) => sum + o.amount, 0),
          status: OrderCollectionStatus.PAID,
          orders: createdOrders.map(({ order, paidQuantity }) => ({
            order,
            paidQuantity,
          })),
          createdBy: user._id,
          tableDate: new Date(),
          ...pkg.collection,
        } as CreateCollectionDto);
      }

      const orderIds = createdOrders.map((o) => o.order);
      await this.webhookLogService.updateWebhookResponse(
        webhookLog._id,
        {
          ordersCreated: orderIds.length,
          orderIds,
          [unmatched.key]: unmatched.values,
        },
        HttpStatus.OK,
        orderIds.length > 0
          ? WebhookStatus.SUCCESS
          : WebhookStatus.ORDER_NOT_CREATED,
        unmatched.values.length > 0
          ? `Menu item not found for ${
              unmatched.label
            }: ${unmatched.values.join(', ')}`
          : undefined,
        orderIds.length > 0 ? orderIds : undefined,
        pkg.referenceId,
        startTime,
      );
      return orderIds.length;
    } catch (error) {
      this.logger.error(
        `Error processing ${this.webhookSource} package ${pkg.referenceId}`,
        error,
      );
      await this.webhookLogService
        .updateWebhookResponse(
          webhookLog._id,
          { error: error?.message || 'Unknown error' },
          HttpStatus.INTERNAL_SERVER_ERROR,
          WebhookStatus.ERROR,
          error?.message || 'Unknown error',
          undefined,
          pkg.referenceId,
          startTime,
        )
        .catch(() => undefined);
      return 0;
    }
  }

  // Zaten iptal edilmiş ya da bulunamayan satır atlanır; satır siparişin
  // tüm adediyle iptal edilir. İptal edilen satır sayısını döner.
  protected async cancelLines(
    user: any,
    lineItemIds: string[],
    handlers: LineOrderHandlers,
    action = 'order-cancel',
  ): Promise<number> {
    const cancelledIds: string[] = [];
    for (const lineItemId of lineItemIds) {
      const order = await handlers.find(lineItemId);
      if (!order || order.status === OrderStatus.CANCELLED) continue;
      try {
        await handlers.cancel(user, lineItemId, order.quantity);
        cancelledIds.push(lineItemId);
      } catch (error) {
        this.logger.error(
          `Error cancelling ${this.webhookSource} line ${lineItemId}`,
          error,
        );
      }
    }

    if (cancelledIds.length > 0) {
      const log = await this.webhookLogService.logWebhookRequest(
        this.webhookSource,
        action,
        { lineItemIds: cancelledIds },
      );
      await this.webhookLogService
        .updateWebhookResponse(
          log._id,
          { cancelled: cancelledIds.length },
          HttpStatus.OK,
          WebhookStatus.SUCCESS,
        )
        .catch(() => undefined);
    }
    return cancelledIds.length;
  }

  // Açık paketlerdeki satırların siparişlerinden, hâlâ rafta olanların
  // ayrılmış adetlerini üretir.
  protected async toReservedEntries(
    orderNumberByLineId: Map<string, string>,
    stockLocation: number,
    channel: ReservedStockDetail['channel'],
    findOrders: (lineItemIds: string[]) => Promise<Order[]>,
    lineItemIdOf: (order: Order) => string,
  ): Promise<ReservedStockEntry[]> {
    if (orderNumberByLineId.size === 0) return [];

    const orders = await findOrders([...orderNumberByLineId.keys()]);
    const entries: ReservedStockEntry[] = [];
    for (const order of orders) {
      if (!isOrderOnShelf(order, stockLocation)) continue;
      entries.push(
        ...toReservedStockEntries(order.item, order.quantity, {
          channel,
          orderNumber: orderNumberByLineId.get(lineItemIdOf(order)),
        }),
      );
    }
    return entries;
  }

  protected async getConstantUser() {
    const user = await this.userService.findByIdWithoutPopulate('dv');
    if (!user) {
      throw new HttpException(
        'Constant user not found',
        HttpStatus.BAD_REQUEST,
      );
    }
    return user;
  }
}
