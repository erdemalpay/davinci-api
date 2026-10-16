import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
export class N11OrderService extends MarketplaceOrderSync {
  protected readonly webhookSource = WebhookSource.N11;
  private static readonly PACKAGE_PAGE_SIZE = 100;
  // GMT+3 yorum belirsizliği ve gecikmeler için; tekrar işleme zararsız.
  private static readonly CURSOR_OVERLAP_MS = 4 * 60 * 60 * 1000;
  private static readonly FIRST_RUN_LOOKBACK_MS = 60 * 60 * 1000;
  private static readonly RESERVED_LOOKBACK_MS = 14 * DAY_MS;
  private static readonly CLAIM_LOOKBACK_MS = 30 * DAY_MS;

  constructor(
    private readonly n11Client: N11Client,
    @Inject(forwardRef(() => OrderService))
    orderService: OrderService,
    @Inject(forwardRef(() => MenuService))
    private readonly menuService: MenuService,
    @Inject(forwardRef(() => UserService))
    userService: UserService,
    webhookLogService: WebhookLogService,
    websocketGateway: AppWebSocketGateway,
    redisService: RedisService,
    @InjectModel(ProcessedN11Claim.name)
    private readonly processedN11ClaimModel: Model<ProcessedN11Claim>,
  ) {
    super(
      orderService,
      userService,
      webhookLogService,
      websocketGateway,
      redisService,
    );
  }

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

  syncOrders() {
    return this.runCursorSync(
      {
        cursorKey: RedisKeys.N11OrderSyncCursor,
        overlapMs: N11OrderService.CURSOR_OVERLAP_MS,
        firstRunLookbackMs: N11OrderService.FIRST_RUN_LOOKBACK_MS,
      },
      async (startDate) => {
        // endDate gönderilmez: yalnızca startDate verilince sonraki 15 gün gelir.
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
          created += await this.createN11PackageOrders(user, pkg, lines);
        }
        const cancelled = await this.cancelLines(user, cancelLineItemIds, {
          find: (id) => this.orderService.findByN11LineItemId(id),
          cancel: (u, id, qty) => this.orderService.cancelN11Order(u, id, qty),
        });
        return { packages: packages.length, created, cancelled };
      },
    );
  }

  private async createN11PackageOrders(
    user: any,
    pkg: N11ShipmentPackage,
    lines: N11OrderLine[],
  ): Promise<number> {
    const matched: MarketplaceOrderLine[] = [];
    const newlyUnmatched: string[] = [];
    const packageId =
      pkg.id !== null && pkg.id !== undefined ? String(pkg.id) : undefined;

    for (const line of lines) {
      const lineItemId = String(line.orderLineId);
      if (await this.orderService.findByN11LineItemId(lineItemId)) continue;

      const menuItem = await this.menuService.findByN11StockCode(
        line.stockCode,
      );
      if (!menuItem?.matchedProduct) {
        if (this.markUnmatchedLine(lineItemId)) {
          newlyUnmatched.push(line.stockCode);
        }
        continue;
      }
      const unitPrice = toUnitPrice(line);
      matched.push({
        lineItemId,
        paidQuantity: line.quantity,
        amount: unitPrice * line.quantity,
        dto: {
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
          n11LineItemId: lineItemId,
          n11ProductId: String(line.productId),
          ...(packageId && { n11ShipmentPackageId: packageId }),
        },
      });
    }
    if (matched.length === 0 && newlyUnmatched.length === 0) return 0;

    return this.createPackageOrders(
      user,
      {
        payload: pkg,
        referenceId: packageId,
        collection: {
          n11OrderNumber: String(pkg.orderNumber),
          ...(packageId && { n11ShipmentPackageId: packageId }),
        },
      },
      matched,
      {
        key: 'unmatchedStockCodes',
        label: 'stockCode',
        values: newlyUnmatched,
      },
    );
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
    return this.toReservedEntries(
      orderNumberByLineId,
      stockLocation,
      'n11',
      (ids) => this.orderService.findByN11LineItemIds(ids),
      (order) => String(order.n11LineItemId),
    );
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
}
