jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { OrderStatus } from '../order/order.dto';
import { RedisKeys } from '../redis/redis.dto';
import { WebhookSource } from '../webhook-log/webhook-log.schema';
import { StockHistoryStatusEnum } from '../accounting/accounting.dto';
import { N11ShipmentPackage } from './n11.dto';
import { N11OrderService } from './n11-order.service';

const NOW = new Date('2026-10-12T10:00:00Z').getTime();

const line = (overrides: any = {}) => ({
  orderLineId: 415490391,
  productId: 123456789,
  productName: 'Flip7',
  stockCode: 'flip7',
  barcode: null,
  quantity: 2,
  price: 1500,
  sellerInvoiceAmount: 2900,
  orderItemLineItemStatusName: 'Created',
  ...overrides,
});

const pkg = (
  overrides: Partial<N11ShipmentPackage> = {},
): N11ShipmentPackage => ({
  id: '112999455244259',
  orderNumber: '203872347637',
  shipmentPackageStatus: 'Created',
  lastModifiedDate: NOW,
  packageHistories: [{ createdDate: 1724274054460, status: 'Created' }],
  lines: [line()],
  ...overrides,
});

function buildService(
  options: {
    packages?: N11ShipmentPackage[];
    existingOrders?: any[];
    cursor?: number | null;
    claims?: any[];
    processedClaimIds?: string[];
    menuItem?: any;
  } = {},
) {
  const {
    packages = [],
    existingOrders = [],
    cursor = null,
    claims = [],
    processedClaimIds = [],
    menuItem = { _id: 55, name: 'Flip7', matchedProduct: 'p-flip' },
  } = options;

  const calls: string[] = [];
  const redisStore: Record<string, any> = {
    [RedisKeys.N11OrderSyncCursor]: cursor,
  };

  const n11Client = {
    request: jest.fn(async (_m: string, _p: string, opts: any) => {
      const wanted = opts.params.status;
      const content = wanted
        ? packages.filter((p) => p.shipmentPackageStatus === wanted)
        : packages;
      return { content: opts.params.page === 0 ? content : [], totalPages: 1 };
    }),
    soapRequest: jest.fn<Promise<any>, [string, string, string]>(async () => ({
      result: { status: 'success' },
      claimReturnList: { claimReturn: claims },
      pagingData: { pageCount: '1' },
    })),
  };

  let nextOrderId = 1000;
  const orderService = {
    findByN11LineItemId: jest.fn(
      async (id: string) =>
        existingOrders.find((o) => o.n11LineItemId === id) ?? null,
    ),
    findByN11LineItemIds: jest.fn(async (ids: string[]) =>
      existingOrders.filter((o) => ids.includes(o.n11LineItemId)),
    ),
    findActiveN11OrdersByOrderNumberAndProduct: jest.fn(
      async (orderNumber: string, productId: string) =>
        existingOrders.filter(
          (o) =>
            o.n11OrderNumber === orderNumber &&
            o.n11ProductId === productId &&
            o.status !== OrderStatus.CANCELLED,
        ),
    ),
    createOrder: jest.fn(async (_u: any, dto: any) => {
      calls.push(`create:${dto.n11LineItemId}`);
      return { _id: ++nextOrderId };
    }),
    createCollection: jest.fn(async () => ({ _id: 1 })),
    cancelN11Order: jest.fn(async (_u: any, id: string, qty: number) => {
      calls.push(`cancel:${id}:${qty}`);
      return {};
    }),
  };
  const menuService = {
    findByN11StockCode: jest.fn(async (code: string) =>
      code === 'flip7' ? menuItem : null,
    ),
  };
  const userService = {
    findByIdWithoutPopulate: jest.fn(async () => ({ _id: 'dv' })),
  };
  const webhookLogService = {
    logWebhookRequest: jest.fn(async () => ({ _id: 7 })),
    updateWebhookResponse: jest.fn(async () => ({})),
  };
  const websocketGateway = { emitOrderGroupChanged: jest.fn() };
  const redisService = {
    get: jest.fn(async (key: string) => redisStore[key] ?? null),
    set: jest.fn(async (key: string, value: any) => {
      redisStore[key] = value;
      return 'OK';
    }),
  };
  const processedN11ClaimModel = {
    findOne: jest.fn(({ claimReturnId }: any) => ({
      exec: jest.fn(async () =>
        processedClaimIds.includes(claimReturnId) ? { claimReturnId } : null,
      ),
    })),
    create: jest.fn(async () => ({})),
  };

  const service = new N11OrderService(
    n11Client as never,
    orderService as never,
    menuService as never,
    userService as never,
    webhookLogService as never,
    websocketGateway as never,
    redisService as never,
    processedN11ClaimModel as never,
  );
  const logger = (service as any).logger;
  for (const level of ['log', 'debug', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }

  return {
    service,
    n11Client,
    orderService,
    webhookLogService,
    websocketGateway,
    redisStore,
    processedN11ClaimModel,
    calls,
  };
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('N11OrderService.syncOrders', () => {
  it('yeni satır için Trendyol alanlarının n11 karşılığıyla sipariş ve tahsilat açar', async () => {
    const { service, orderService, webhookLogService, websocketGateway } =
      buildService({ packages: [pkg()] });

    const result = await service.syncOrders();

    expect(orderService.createOrder).toHaveBeenCalledWith(
      { _id: 'dv' },
      expect.objectContaining({
        item: 55,
        quantity: 2,
        unitPrice: 1450,
        location: 4,
        stockLocation: 6,
        status: OrderStatus.AUTOSERVED,
        paymentMethod: 'n11',
        isOnlineSale: true,
        stockNote: StockHistoryStatusEnum.N11ORDERCREATE,
        createdAt: new Date(1724274054460),
        n11OrderNumber: '203872347637',
        n11ShipmentPackageId: '112999455244259',
        n11LineItemId: '415490391',
        n11ProductId: '123456789',
      }),
    );
    expect(orderService.createCollection).toHaveBeenCalledWith(
      { _id: 'dv' },
      expect.objectContaining({
        location: 4,
        paymentMethod: 'n11',
        amount: 2900,
        orders: [{ order: 1001, paidQuantity: 2 }],
        n11OrderNumber: '203872347637',
        n11ShipmentPackageId: '112999455244259',
      }),
    );
    expect(webhookLogService.logWebhookRequest).toHaveBeenCalledWith(
      WebhookSource.N11,
      'order-sync',
      expect.anything(),
    );
    expect(websocketGateway.emitOrderGroupChanged).toHaveBeenCalled();
    expect(result).toMatchObject({ created: 1, cancelled: 0 });
  });

  it('satır zaten varsa tekrar oluşturmaz ve log yazmaz', async () => {
    const { service, orderService, webhookLogService } = buildService({
      packages: [pkg()],
      existingOrders: [
        { n11LineItemId: '415490391', quantity: 2, status: 'autoserved' },
      ],
    });

    await service.syncOrders();

    expect(orderService.createOrder).not.toHaveBeenCalled();
    expect(webhookLogService.logWebhookRequest).not.toHaveBeenCalled();
  });

  it('paket numarası null ise n11ShipmentPackageId gönderilmez', async () => {
    const { service, orderService } = buildService({
      packages: [pkg({ id: null })],
    });

    await service.syncOrders();

    const dto = orderService.createOrder.mock.calls[0][1];
    expect(dto).not.toHaveProperty('n11ShipmentPackageId');
  });

  it('eşleşmeyen stockCode atlanır, aynı satır ikinci turda tekrar loglanmaz', async () => {
    const { service, orderService, webhookLogService } = buildService({
      packages: [pkg({ lines: [line({ stockCode: 'yok' })] })],
    });

    await service.syncOrders();
    await service.syncOrders();

    expect(orderService.createOrder).not.toHaveBeenCalled();
    expect(webhookLogService.logWebhookRequest).toHaveBeenCalledTimes(1);
  });

  it('iptal edilen paketin siparişini tüm adetle iptal eder', async () => {
    const { service, calls } = buildService({
      packages: [pkg({ shipmentPackageStatus: 'Cancelled' })],
      existingOrders: [
        { n11LineItemId: '415490391', quantity: 2, status: 'autoserved' },
      ],
    });

    const result = await service.syncOrders();

    expect(calls).toEqual(['cancel:415490391:2']);
    expect(result).toMatchObject({ created: 0, cancelled: 1 });
  });

  it('zaten iptal edilmiş siparişi tekrar iptal etmez', async () => {
    const { service, orderService } = buildService({
      packages: [pkg({ shipmentPackageStatus: 'Cancelled' })],
      existingOrders: [
        {
          n11LineItemId: '415490391',
          quantity: 2,
          status: OrderStatus.CANCELLED,
        },
      ],
    });

    await service.syncOrders();

    expect(orderService.cancelN11Order).not.toHaveBeenCalled();
  });

  it('bölünmede önce yeni paket oluşturulur, sonra eski iptal edilir', async () => {
    const { service, calls } = buildService({
      packages: [
        pkg({
          id: 'old',
          shipmentPackageStatus: 'Unpacked',
          lines: [line({ orderLineId: 10 })],
        }),
        pkg({
          id: 'new',
          shipmentPackageStatus: 'Picking',
          lines: [
            line({ orderLineId: 11, quantity: 1, sellerInvoiceAmount: 1450 }),
          ],
        }),
      ],
      existingOrders: [
        { n11LineItemId: '10', quantity: 2, status: 'autoserved' },
      ],
    });

    await service.syncOrders();

    expect(calls).toEqual(['create:11', 'cancel:10:2']);
  });

  it('başarılı turda cursor tur başlangıcına ilerler, ilk turda 1 saat geriye bakar', async () => {
    const { service, n11Client, redisStore } = buildService();

    await service.syncOrders();

    expect(n11Client.request.mock.calls[0][2].params).toMatchObject({
      startDate: NOW - 60 * 60 * 1000,
      orderByField: true,
      orderByDirection: 'ASC',
      size: 100,
    });
    expect(n11Client.request.mock.calls[0][2].params).not.toHaveProperty(
      'endDate',
    );
    expect(redisStore[RedisKeys.N11OrderSyncCursor]).toBe(NOW);
  });

  it('cursor varsa 4 saat geri bindirerek sorar', async () => {
    const cursor = NOW - 2 * 60 * 1000;
    const { service, n11Client } = buildService({ cursor });

    await service.syncOrders();

    expect(n11Client.request.mock.calls[0][2].params.startDate).toBe(
      cursor - 4 * 60 * 60 * 1000,
    );
  });

  it('istek hata verirse cursor ilerlemez', async () => {
    const cursor = NOW - 2 * 60 * 1000;
    const { service, n11Client, redisStore } = buildService({ cursor });
    n11Client.request.mockRejectedValueOnce(new Error('down'));

    await expect(service.syncOrders()).rejects.toThrow('down');
    expect(redisStore[RedisKeys.N11OrderSyncCursor]).toBe(cursor);
  });

  it('aynı anda ikinci çağrı atlanır', async () => {
    const { service } = buildService();

    const [first, second] = await Promise.all([
      service.syncOrders(),
      service.syncOrders(),
    ]);

    expect([first.skipped, second.skipped].sort()).toEqual([false, true]);
  });
});

describe('N11OrderService.getReservedStocks', () => {
  it('Created ve Picking ayrı sorulur, rafta olan siparişler döner', async () => {
    const item = {
      itemProduction: [
        { product: 'flip', quantity: 1, isDecrementStock: true },
      ],
    };
    const { service, n11Client } = buildService({
      packages: [
        pkg({
          shipmentPackageStatus: 'Created',
          lines: [line({ orderLineId: 1 })],
        }),
        pkg({
          shipmentPackageStatus: 'Picking',
          orderNumber: '999',
          lines: [line({ orderLineId: 2 })],
        }),
      ],
      existingOrders: [
        {
          n11LineItemId: '1',
          quantity: 2,
          status: 'autoserved',
          stockLocation: 6,
          item,
        },
        {
          n11LineItemId: '2',
          quantity: 1,
          status: OrderStatus.CANCELLED,
          stockLocation: 6,
          item,
        },
      ],
    });

    const entries = await service.getReservedStocks(6);

    expect(n11Client.request.mock.calls.map((c) => c[2].params.status)).toEqual(
      ['Created', 'Picking'],
    );
    expect(entries).toEqual([
      {
        channel: 'n11',
        orderNumber: '203872347637',
        product: 'flip',
        quantity: 2,
      },
    ]);
  });

  it('açık paket yoksa veritabanına gitmez', async () => {
    const { service, orderService } = buildService();
    expect(await service.getReservedStocks(6)).toEqual([]);
    expect(orderService.findByN11LineItemIds).not.toHaveBeenCalled();
  });
});

describe('N11OrderService.processAcceptedClaims', () => {
  const claim = {
    claimReturnId: '25391658',
    status: 'APPROVED',
    orderNumber: '203872347637',
    productId: '123456789',
    productName: 'Flip7',
    quantity: '3',
  };

  it('iade adedini siparişlere sırayla dağıtır ve kaydeder', async () => {
    const { service, calls, processedN11ClaimModel, n11Client } = buildService({
      claims: [claim],
      existingOrders: [
        {
          n11LineItemId: 'a',
          n11OrderNumber: '203872347637',
          n11ProductId: '123456789',
          quantity: 2,
          status: 'autoserved',
        },
        {
          n11LineItemId: 'b',
          n11OrderNumber: '203872347637',
          n11ProductId: '123456789',
          quantity: 2,
          status: 'autoserved',
        },
      ],
    });

    const result = await service.processAcceptedClaims();

    expect(n11Client.soapRequest.mock.calls[0][2]).toContain(
      '<status>APPROVED</status>',
    );
    expect(calls).toEqual(['cancel:a:2', 'cancel:b:1']);
    expect(processedN11ClaimModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        claimReturnId: '25391658',
        action: 'CANCELLED',
        success: true,
      }),
    );
    expect(result.stats).toEqual({
      totalClaimsChecked: 1,
      processed: 1,
      skipped: 0,
      cancelled: 2,
      errors: 0,
    });
  });

  it('daha önce işlenmiş iade atlanır', async () => {
    const { service, orderService } = buildService({
      claims: [claim],
      processedClaimIds: ['25391658'],
    });

    const result = await service.processAcceptedClaims();

    expect(orderService.cancelN11Order).not.toHaveBeenCalled();
    expect(result.stats.skipped).toBe(1);
  });

  it('sipariş bulunamazsa ORDER_NOT_FOUND olarak kaydedilir', async () => {
    const { service, processedN11ClaimModel } = buildService({
      claims: [claim],
    });

    await service.processAcceptedClaims();

    expect(processedN11ClaimModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ORDER_NOT_FOUND', success: false }),
    );
  });

  it('bir iptal başarılı olduktan sonra hata olursa PARTIALLY_CANCELLED kaydı yazılır', async () => {
    const { service, orderService, processedN11ClaimModel } = buildService({
      claims: [claim],
      existingOrders: [
        {
          n11LineItemId: 'a',
          n11OrderNumber: '203872347637',
          n11ProductId: '123456789',
          quantity: 2,
          status: 'autoserved',
        },
        {
          n11LineItemId: 'b',
          n11OrderNumber: '203872347637',
          n11ProductId: '123456789',
          quantity: 2,
          status: 'autoserved',
        },
      ],
    });
    orderService.cancelN11Order
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('tx failed'));

    const result = await service.processAcceptedClaims();

    expect(processedN11ClaimModel.create).toHaveBeenCalledTimes(1);
    expect(processedN11ClaimModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        claimReturnId: '25391658',
        action: 'PARTIALLY_CANCELLED',
        success: false,
        errorMessage: 'tx failed',
      }),
    );
    expect(result.stats.errors).toBe(1);
    expect(result.stats.cancelled).toBe(1);
  });

  it('iptal hata verirse kayıt yazılmaz, sonraki tur tekrar dener', async () => {
    const { service, orderService, processedN11ClaimModel } = buildService({
      claims: [claim],
      existingOrders: [
        {
          n11LineItemId: 'a',
          n11OrderNumber: '203872347637',
          n11ProductId: '123456789',
          quantity: 3,
          status: 'autoserved',
        },
      ],
    });
    orderService.cancelN11Order.mockRejectedValueOnce(new Error('tx failed'));

    const result = await service.processAcceptedClaims();

    expect(processedN11ClaimModel.create).not.toHaveBeenCalled();
    expect(result.stats.errors).toBe(1);
  });
});
