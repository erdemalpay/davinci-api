import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isOrderOnShelf, toReservedStockEntries } from 'src/lib/mappers';
import { StockHistoryStatusEnum } from '../accounting/accounting.dto';
import { ReservedStockEntry } from '../accounting/count.schema';
import { MenuService } from '../menu/menu.service';
import {
  CreateOrderDto,
  OrderCollectionStatus,
  OrderStatus,
} from '../order/order.dto';
import { OrderService } from '../order/order.service';
import { RedisKeys } from '../redis/redis.dto';
import { RedisService } from '../redis/redis.service';
import { UserService } from '../user/user.service';
import {
  WebhookSource,
  WebhookStatus,
} from '../webhook-log/webhook-log.schema';
import { WebhookLogService } from '../webhook-log/webhook-log.service';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { N11Client } from './n11.client';
import {
  N11ClaimReturn,
  N11OrderLine,
  N11ShipmentPackage,
  N11ShipmentPackagePage,
} from './n11.dto';
import {
  formatN11Date,
  mapClaimReturn,
  N11_RESERVED_PACKAGE_STATUSES,
  packageCreatedAt,
  planPackageActions,
  toArray,
  toUnitPrice,
} from './n11.mappers';
import { ProcessedN11Claim } from './processed-n11-claim.schema';

const DAY_MS = 24 * 60 * 60 * 1000;

// n11 webhook göndermediği için siparişler polling ile çekilir.
@Injectable()
export class N11OrderService {
  private readonly logger = new Logger(N11OrderService.name);
  private static readonly PACKAGE_PAGE_SIZE = 100;
  // GMT+3 yorum belirsizliği ve gecikmeler için; tekrar işleme zararsız.
  private static readonly CURSOR_OVERLAP_MS = 4 * 60 * 60 * 1000;
  private static readonly FIRST_RUN_LOOKBACK_MS = 60 * 60 * 1000;
  private static readonly RESERVED_LOOKBACK_MS = 14 * DAY_MS;
  private static readonly CLAIM_LOOKBACK_MS = 30 * DAY_MS;
  private static readonly MAX_REPORTED_UNMATCHED_LINES = 1000;
  private readonly OnlineStoreLocation = 4;
  private readonly OnlineStoreStockLocation = 6;

  private isSyncing = false;
  // Eşleşmeyen satırlar her 2 dakikada bir tekrar loglanmasın.
  private readonly reportedUnmatchedLines = new Set<string>();

  constructor(
    private readonly n11Client: N11Client,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    @Inject(forwardRef(() => MenuService))
    private readonly menuService: MenuService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly webhookLogService: WebhookLogService,
    private readonly websocketGateway: AppWebSocketGateway,
    private readonly redisService: RedisService,
    @InjectModel(ProcessedN11Claim.name)
    private readonly processedN11ClaimModel: Model<ProcessedN11Claim>,
  ) {}

  async getPackages(
    params: Record<string, any>,
  ): Promise<N11ShipmentPackage[]> {
    const packages: N11ShipmentPackage[] = [];
    let page = 0;
    let totalPages = 1;
    while (page < totalPages) {
      const data = await this.n11Client.request<N11ShipmentPackagePage>(
        'GET',
        '/rest/delivery/v1/shipmentPackages',
        {
          params: { ...params, page, size: N11OrderService.PACKAGE_PAGE_SIZE },
          skipSuccessLog: (d) => !d?.content?.length,
        },
      );
      packages.push(...(data.content ?? []));
      totalPages = data.totalPages ?? 0;
      page++;
    }
    return packages;
  }

  async syncOrders() {
    if (this.isSyncing) {
      return { skipped: true };
    }
    this.isSyncing = true;
    const startedAt = Date.now();

    try {
      const cursor: number | null = await this.redisService.get(
        RedisKeys.N11OrderSyncCursor,
      );
      // endDate gönderilmez: yalnızca startDate verilince sonraki 15 gün gelir.
      const startDate = cursor
        ? cursor - N11OrderService.CURSOR_OVERLAP_MS
        : startedAt - N11OrderService.FIRST_RUN_LOOKBACK_MS;
      const packages = await this.getPackages({
        startDate,
        orderByField: true,
        orderByDirection: 'ASC',
      });

      const { creates, cancelLineItemIds } = planPackageActions(packages);
      const user = await this.getConstantUser();

      // Önce oluştur, sonra iptal et: bölünmede stok geçici olarak fazla
      // görünüp diğer kanallarda fazla satış açılmasın.
      let created = 0;
      for (const { pkg, lines } of creates) {
        created += await this.createPackageOrders(user, pkg, lines);
      }
      const cancelled = await this.cancelLines(user, cancelLineItemIds);

      await this.redisService.set(RedisKeys.N11OrderSyncCursor, startedAt);

      if (created > 0 || cancelled > 0) {
        this.websocketGateway.emitOrderGroupChanged();
      }
      return { skipped: false, packages: packages.length, created, cancelled };
    } finally {
      this.isSyncing = false;
    }
  }

  private async createPackageOrders(
    user: any,
    pkg: N11ShipmentPackage,
    lines: N11OrderLine[],
  ): Promise<number> {
    const newLines: N11OrderLine[] = [];
    for (const line of lines) {
      const existing = await this.orderService.findByN11LineItemId(
        String(line.orderLineId),
      );
      if (!existing) newLines.push(line);
    }
    if (newLines.length === 0) return 0;

    const matched: Array<{ line: N11OrderLine; menuItem: any }> = [];
    const newlyUnmatched: string[] = [];
    for (const line of newLines) {
      const menuItem = await this.menuService.findByN11StockCode(
        line.stockCode,
      );
      if (menuItem?.matchedProduct) {
        matched.push({ line, menuItem });
        continue;
      }
      const lineId = String(line.orderLineId);
      if (!this.reportedUnmatchedLines.has(lineId)) {
        // Uygulama açık kaldıkça büyümesin; temizlenirse en fazla bir kez daha loglanır.
        if (
          this.reportedUnmatchedLines.size >=
          N11OrderService.MAX_REPORTED_UNMATCHED_LINES
        ) {
          this.reportedUnmatchedLines.clear();
        }
        this.reportedUnmatchedLines.add(lineId);
        newlyUnmatched.push(line.stockCode);
      }
    }
    if (matched.length === 0 && newlyUnmatched.length === 0) return 0;

    const startTime = Date.now();
    const packageId =
      pkg.id !== null && pkg.id !== undefined ? String(pkg.id) : undefined;
    const webhookLog = await this.webhookLogService.logWebhookRequest(
      WebhookSource.N11,
      'order-sync',
      pkg,
    );

    try {
      const createdOrders: Array<{
        order: number;
        paidQuantity: number;
        amount: number;
      }> = [];
      for (const { line, menuItem } of matched) {
        const unitPrice = toUnitPrice(line);
        const createOrderObject: CreateOrderDto = {
          item: menuItem._id,
          quantity: line.quantity,
          note: '',
          discount: undefined,
          discountNote: '',
          isOnlinePrice: false,
          location: this.OnlineStoreLocation,
          unitPrice,
          paidQuantity: 0,
          status: OrderStatus.AUTOSERVED,
          stockLocation: this.OnlineStoreStockLocation,
          createdAt: packageCreatedAt(pkg),
          tableDate: new Date(),
          createdBy: user._id,
          stockNote: StockHistoryStatusEnum.N11ORDERCREATE,
          paymentMethod: 'n11',
          isOnlineSale: true,
          n11OrderNumber: String(pkg.orderNumber),
          n11LineItemId: String(line.orderLineId),
          n11ProductId: String(line.productId),
          ...(packageId && { n11ShipmentPackageId: packageId }),
        };
        try {
          const order = await this.orderService.createOrder(
            user,
            createOrderObject,
          );
          createdOrders.push({
            order: order._id,
            paidQuantity: line.quantity,
            amount: unitPrice * line.quantity,
          });
        } catch (orderError) {
          this.logger.error(
            `Error creating n11 order for line ${line.orderLineId}`,
            orderError,
          );
        }
      }

      if (createdOrders.length > 0) {
        await this.orderService.createCollection(user, {
          location: this.OnlineStoreLocation,
          paymentMethod: 'n11',
          amount: createdOrders.reduce((sum, o) => sum + o.amount, 0),
          status: OrderCollectionStatus.PAID,
          orders: createdOrders.map(({ order, paidQuantity }) => ({
            order,
            paidQuantity,
          })),
          createdBy: user._id,
          tableDate: new Date(),
          n11OrderNumber: String(pkg.orderNumber),
          ...(packageId && { n11ShipmentPackageId: packageId }),
        });
      }

      const orderIds = createdOrders.map((o) => o.order);
      await this.webhookLogService.updateWebhookResponse(
        webhookLog._id,
        {
          ordersCreated: orderIds.length,
          orderIds,
          unmatchedStockCodes: newlyUnmatched,
        },
        HttpStatus.OK,
        orderIds.length > 0
          ? WebhookStatus.SUCCESS
          : WebhookStatus.ORDER_NOT_CREATED,
        newlyUnmatched.length > 0
          ? `Menu item not found for stockCode: ${newlyUnmatched.join(', ')}`
          : undefined,
        orderIds.length > 0 ? orderIds : undefined,
        packageId,
        startTime,
      );
      return orderIds.length;
    } catch (error) {
      this.logger.error(`Error processing n11 package ${packageId}`, error);
      await this.webhookLogService
        .updateWebhookResponse(
          webhookLog._id,
          { error: error?.message || 'Unknown error' },
          HttpStatus.INTERNAL_SERVER_ERROR,
          WebhookStatus.ERROR,
          error?.message || 'Unknown error',
          undefined,
          packageId,
          startTime,
        )
        .catch(() => undefined);
      return 0;
    }
  }

  private async cancelLines(user: any, lineItemIds: string[]): Promise<number> {
    const cancelledIds: string[] = [];
    for (const lineItemId of lineItemIds) {
      const order = await this.orderService.findByN11LineItemId(lineItemId);
      if (!order || order.status === OrderStatus.CANCELLED) continue;
      try {
        await this.orderService.cancelN11Order(
          user,
          lineItemId,
          order.quantity,
        );
        cancelledIds.push(lineItemId);
      } catch (error) {
        this.logger.error(`Error cancelling n11 line ${lineItemId}`, error);
      }
    }

    if (cancelledIds.length > 0) {
      const log = await this.webhookLogService.logWebhookRequest(
        WebhookSource.N11,
        'order-cancel',
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

  // n11 statü filtresi tek değer alıyor; her statü ayrı sorgulanır.
  async getReservedStocks(
    stockLocation: number,
  ): Promise<ReservedStockEntry[]> {
    const startDate = Date.now() - N11OrderService.RESERVED_LOOKBACK_MS;
    const orderNumberByLineId = new Map<string, string>();

    for (const status of N11_RESERVED_PACKAGE_STATUSES) {
      const packages = await this.getPackages({ status, startDate });
      for (const pkg of packages) {
        for (const line of pkg.lines ?? []) {
          orderNumberByLineId.set(
            String(line.orderLineId),
            String(pkg.orderNumber),
          );
        }
      }
    }
    if (orderNumberByLineId.size === 0) return [];

    const orders = await this.orderService.findByN11LineItemIds([
      ...orderNumberByLineId.keys(),
    ]);
    const entries: ReservedStockEntry[] = [];
    for (const order of orders) {
      if (!isOrderOnShelf(order, stockLocation)) continue;
      entries.push(
        ...toReservedStockEntries(order.item, order.quantity, {
          channel: 'n11',
          orderNumber: orderNumberByLineId.get(String(order.n11LineItemId)),
        }),
      );
    }
    return entries;
  }

  async getApprovedClaims(): Promise<N11ClaimReturn[]> {
    const end = new Date();
    const start = new Date(end.getTime() - N11OrderService.CLAIM_LOOKBACK_MS);
    const claims: N11ClaimReturn[] = [];
    let currentPage = 0;
    let pageCount = 1;

    while (currentPage < pageCount) {
      const response = await this.n11Client.soapRequest(
        'ReturnService',
        'ClaimReturnList',
        '<searchData><status>APPROVED</status>' +
          `<period><startDate>${formatN11Date(
            start,
          )}</startDate><endDate>${formatN11Date(end)}</endDate></period>` +
          '</searchData>' +
          `<pagingData><currentPage>${currentPage}</currentPage></pagingData>`,
      );
      claims.push(
        ...toArray(response?.claimReturnList?.claimReturn).map(mapClaimReturn),
      );
      // Doc örneklerinden birinde pagingData claimReturnList'in içinde geliyor.
      const paging =
        response?.pagingData ?? response?.claimReturnList?.pagingData;
      pageCount = Number(paging?.pageCount ?? 0);
      currentPage++;
    }
    return claims;
  }

  // İade satır numarası taşımadığı için siparişler orderNumber + productId ile
  // bulunur ve iade adedi bunlara sırayla dağıtılır.
  async processAcceptedClaims() {
    const claims = await this.getApprovedClaims();
    const user = await this.getConstantUser();
    let processed = 0;
    let skipped = 0;
    let cancelled = 0;
    let errors = 0;

    for (const claim of claims) {
      let cancelledOrders = 0;
      try {
        const existing = await this.processedN11ClaimModel
          .findOne({ claimReturnId: claim.claimReturnId })
          .exec();
        if (existing) {
          skipped++;
          continue;
        }

        const orders =
          await this.orderService.findActiveN11OrdersByOrderNumberAndProduct(
            claim.orderNumber,
            claim.productId,
          );
        let remaining = claim.quantity;
        for (const order of orders) {
          if (remaining <= 0) break;
          const quantity = Math.min(remaining, order.quantity);
          await this.orderService.cancelN11Order(
            user,
            order.n11LineItemId,
            quantity,
          );
          remaining -= quantity;
          cancelledOrders++;
        }

        await this.processedN11ClaimModel.create({
          claimReturnId: claim.claimReturnId,
          orderNumber: claim.orderNumber,
          statusAtProcess: claim.status,
          action: cancelledOrders > 0 ? 'CANCELLED' : 'ORDER_NOT_FOUND',
          success: cancelledOrders > 0,
          processedAt: new Date(),
          metadata: {
            productId: claim.productId,
            productName: claim.productName,
            quantity: claim.quantity,
            returnReasonType: claim.returnReasonType,
            cancelledOrdersCount: cancelledOrders,
          },
        });
        processed++;
        cancelled += cancelledOrders;
      } catch (error) {
        this.logger.error(
          `Error processing n11 claim ${claim.claimReturnId}`,
          error,
        );
        errors++;
        // İptal edilen adet geri alınamaz; tekrar denenirse fazla iptal olur.
        if (cancelledOrders > 0) {
          cancelled += cancelledOrders;
          await this.processedN11ClaimModel
            .create({
              claimReturnId: claim.claimReturnId,
              orderNumber: claim.orderNumber,
              statusAtProcess: claim.status,
              action: 'PARTIALLY_CANCELLED',
              success: false,
              errorMessage: error?.message,
              processedAt: new Date(),
              metadata: {
                productId: claim.productId,
                productName: claim.productName,
                quantity: claim.quantity,
                returnReasonType: claim.returnReasonType,
                cancelledOrdersCount: cancelledOrders,
              },
            })
            .catch(() => undefined);
        }
      }
    }

    if (cancelled > 0) {
      this.websocketGateway.emitOrderGroupChanged();
    }
    return {
      success: true,
      message: 'n11 approved claims processing completed',
      stats: {
        totalClaimsChecked: claims.length,
        processed,
        skipped,
        cancelled,
        errors,
      },
    };
  }

  private async getConstantUser() {
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
