jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { OrderStatus } from '../order/order.dto';
import { RedisKeys } from '../redis/redis.dto';
import { WebhookSource } from '../webhook-log/webhook-log.schema';
import { StockHistoryStatusEnum } from '../accounting/accounting.dto';
import { IdefixShipment } from './idefix.dto';
import { IdefixOrderService } from './idefix-order.service';

const NOW = new Date('2026-10-14T09:30:00Z').getTime();
const LIST = '/oms/28163/list';
const CLAIMS = '/oms/28163/claim-list';

const item = (overrides: any = {}) => ({
  id: 10000043,
  barcode: '3664824001505',
  productName: 'Next Station London',
  price: 1250,
  discountedTotalPrice: 1250,
  vendorAmount: 1200,
  itemStatus: 'created',
  ...overrides,
});

const shipment = (overrides: Partial<IdefixShipment> = {}): IdefixShipment => ({
  id: 60000003,
  orderNumber: 'IDE642eabe9bd3b2',
  status: 'shipment_ready',
  orderDate: '2026-10-14T11:24:25+03:00',
  createdAt: '2026-10-14T11:27:52+03:00',
  updatedAt: '2026-10-14T11:27:52+03:00',
  items: [item()],
  ...overrides,
});

function buildService(
  options: {
    shipments?: IdefixShipment[];
    claims?: any[];
    existingOrders?: any[];
    cursor?: number | null;
    menuItem?: any;
  } = {},
) {
  const {
    shipments = [],
    claims = [],
    existingOrders = [],
    cursor = null,
    menuItem = { _id: 55, name: 'Next Station London', matchedProduct: 'p' },
  } = options;

  const calls: string[] = [];
  const redisStore: Record<string, any> = {
    [RedisKeys.IdefixOrderSyncCursor]: cursor,
  };

  const idefixClient = {
    request: jest.fn<Promise<any>, any[]>(async (_m, path, opts) => {
      const source = path === CLAIMS ? claims : shipments;
      const wanted = opts.params.state;
      const items = wanted
        ? source.filter((s: any) => s.status === wanted)
        : source;
      return { items: opts.params.page === 1 ? items : [], pageCount: 1 };
    }),
  };

  let nextOrderId = 1000;
  const orderService = {
    findByIdefixLineItemId: jest.fn(
      async (id: string) =>
        existingOrders.find((o) => o.idefixLineItemId === id) ?? null,
    ),
    findByIdefixLineItemIds: jest.fn(async (ids: string[]) =>
      existingOrders.filter((o) => ids.includes(o.idefixLineItemId)),
    ),
    createOrder: jest.fn<Promise<any>, any[]>(async (_u, dto) => {
      calls.push(`create:${dto.idefixLineItemId}`);
      return { _id: ++nextOrderId };
    }),
    createCollection: jest.fn(async () => ({ _id: 1 })),
    cancelIdefixOrder: jest.fn<Promise<any>, any[]>(async (_u, id, qty) => {
      calls.push(`cancel:${id}:${qty}`);
      return {};
    }),
  };
  const menuService = {
    findByIdefixBarcode: jest.fn(async (barcode: string) =>
      barcode === '3664824001505' ? menuItem : null,
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

  const service = new IdefixOrderService(
    idefixClient as never,
    orderService as never,
    menuService as never,
    userService as never,
    webhookLogService as never,
    websocketGateway as never,
    redisService as never,
  );
  const logger = (service as any).logger;
  for (const level of ['log', 'debug', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }

  return {
    service,
    idefixClient,
    orderService,
    webhookLogService,
    websocketGateway,
    redisStore,
    calls,
  };
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('IdefixOrderService.syncOrders', () => {
  it('yeni kalem için 1 adetlik sipariş ve sevkiyat başına tahsilat açar', async () => {
    const { service, orderService, webhookLogService, websocketGateway } =
      buildService({
        shipments: [shipment({ items: [item(), item({ id: 10000044 })] })],
      });

    const result = await service.syncOrders();

    expect(orderService.createOrder).toHaveBeenCalledTimes(2);
    expect(orderService.createOrder).toHaveBeenCalledWith(
      { _id: 'dv' },
      expect.objectContaining({
        item: 55,
        quantity: 1,
        unitPrice: 1200,
        location: 4,
        stockLocation: 6,
        status: OrderStatus.AUTOSERVED,
        paymentMethod: 'idefix',
        isOnlineSale: true,
        stockNote: StockHistoryStatusEnum.IDEFIXORDERCREATE,
        createdAt: new Date('2026-10-14T11:24:25+03:00'),
        idefixOrderNumber: 'IDE642eabe9bd3b2',
        idefixShipmentId: '60000003',
        idefixLineItemId: '10000043',
      }),
    );
    expect(orderService.createCollection).toHaveBeenCalledWith(
      { _id: 'dv' },
      expect.objectContaining({
        location: 4,
        paymentMethod: 'idefix',
        amount: 2400,
        orders: [
          { order: 1001, paidQuantity: 1 },
          { order: 1002, paidQuantity: 1 },
        ],
        idefixOrderNumber: 'IDE642eabe9bd3b2',
        idefixShipmentId: '60000003',
      }),
    );
    expect(webhookLogService.logWebhookRequest).toHaveBeenCalledWith(
      WebhookSource.IDEFIX,
      'order-sync',
      expect.anything(),
    );
    expect(websocketGateway.emitOrderGroupChanged).toHaveBeenCalled();
    expect(result).toMatchObject({ created: 2, cancelled: 0 });
  });

  it('kalem zaten varsa tekrar oluşturmaz ve log yazmaz', async () => {
    const { service, orderService, webhookLogService } = buildService({
      shipments: [shipment()],
      existingOrders: [
        { idefixLineItemId: '10000043', quantity: 1, status: 'autoserved' },
      ],
    });

    await service.syncOrders();

    expect(orderService.createOrder).not.toHaveBeenCalled();
    expect(webhookLogService.logWebhookRequest).not.toHaveBeenCalled();
  });

  it('eşleşmeyen barkod atlanır, aynı kalem ikinci turda tekrar loglanmaz', async () => {
    const { service, orderService, webhookLogService } = buildService({
      shipments: [shipment({ items: [item({ barcode: 'yok' })] })],
    });

    await service.syncOrders();
    await service.syncOrders();

    expect(orderService.createOrder).not.toHaveBeenCalled();
    expect(webhookLogService.logWebhookRequest).toHaveBeenCalledTimes(1);
  });

  it('iptal edilen ve tedarik edilemeyen sevkiyatların siparişlerini iptal eder', async () => {
    const { service, calls } = buildService({
      shipments: [
        shipment({ status: 'shipment_cancelled', items: [item({ id: 1 })] }),
        shipment({ status: 'shipment_unsupplied', items: [item({ id: 2 })] }),
      ],
      existingOrders: [
        { idefixLineItemId: '1', quantity: 1, status: 'autoserved' },
        { idefixLineItemId: '2', quantity: 1, status: 'autoserved' },
      ],
    });

    const result = await service.syncOrders();

    expect(calls).toEqual(['cancel:1:1', 'cancel:2:1']);
    expect(result).toMatchObject({ created: 0, cancelled: 2 });
  });

  it('zaten iptal edilmiş siparişi tekrar iptal etmez', async () => {
    const { service, orderService } = buildService({
      shipments: [shipment({ status: 'shipment_cancelled' })],
      existingOrders: [
        {
          idefixLineItemId: '10000043',
          quantity: 1,
          status: OrderStatus.CANCELLED,
        },
      ],
    });

    await service.syncOrders();

    expect(orderService.cancelIdefixOrder).not.toHaveBeenCalled();
  });

  it('tedarik edilemeyende yeni sevkiyata taşınan kalem iptal edilmez', async () => {
    const { service, calls } = buildService({
      shipments: [
        shipment({
          id: 1,
          status: 'shipment_unsupplied',
          items: [item({ id: 10 }), item({ id: 11 })],
        }),
        shipment({
          id: 2,
          status: 'shipment_ready',
          items: [item({ id: 11 })],
        }),
      ],
      existingOrders: [
        { idefixLineItemId: '10', quantity: 1, status: 'autoserved' },
        { idefixLineItemId: '11', quantity: 1, status: 'autoserved' },
      ],
    });

    await service.syncOrders();

    expect(calls).toEqual(['cancel:10:1']);
  });

  it('bölünen ve teslim edilemeyen sevkiyatlara dokunmaz', async () => {
    const { service, orderService } = buildService({
      shipments: [
        shipment({ status: 'shipment_split' }),
        shipment({ status: 'shipment_undeliver' }),
      ],
      existingOrders: [
        { idefixLineItemId: '10000043', quantity: 1, status: 'autoserved' },
      ],
    });

    await service.syncOrders();

    expect(orderService.createOrder).not.toHaveBeenCalled();
    expect(orderService.cancelIdefixOrder).not.toHaveBeenCalled();
  });

  it('ilk turda 1 saat geriye bakar, İstanbul saatiyle sorar ve cursor ilerler', async () => {
    const { service, idefixClient, redisStore } = buildService();

    await service.syncOrders();

    const [, path, opts] = idefixClient.request.mock.calls[0];
    expect(path).toBe(LIST);
    // 08:30 UTC = 11:30 İstanbul
    expect(opts.params).toMatchObject({
      lastUpdatedAt: '2026/10/14 11:30:00',
      sortByField: 'updateAt',
      sortDirection: 'asc',
      page: 1,
      limit: 100,
    });
    expect(redisStore[RedisKeys.IdefixOrderSyncCursor]).toBe(NOW);
  });

  it('cursor varsa 4 saat geri bindirerek sorar', async () => {
    const { service, idefixClient } = buildService({
      cursor: NOW - 2 * 60 * 1000,
    });

    await service.syncOrders();

    // 09:28 UTC - 4 saat = 05:28 UTC = 08:28 İstanbul
    expect(idefixClient.request.mock.calls[0][2].params.lastUpdatedAt).toBe(
      '2026/10/14 08:28:00',
    );
  });

  it('istek hata verirse cursor ilerlemez', async () => {
    const cursor = NOW - 2 * 60 * 1000;
    const { service, idefixClient, redisStore } = buildService({ cursor });
    idefixClient.request.mockRejectedValueOnce(new Error('down'));

    await expect(service.syncOrders()).rejects.toThrow('down');
    expect(redisStore[RedisKeys.IdefixOrderSyncCursor]).toBe(cursor);
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

describe('IdefixOrderService.getReservedStocks', () => {
  it('kargolanmamış statüler ayrı sorulur, rafta olan siparişler döner', async () => {
    const menuItem = {
      itemProduction: [
        { product: 'london', quantity: 1, isDecrementStock: true },
      ],
    };
    const { service, idefixClient } = buildService({
      shipments: [
        shipment({ status: 'created', items: [item({ id: 1 })] }),
        shipment({
          status: 'shipment_picking',
          orderNumber: 'IDE999',
          items: [item({ id: 2 })],
        }),
        shipment({ status: 'shipment_in_cargo', items: [item({ id: 3 })] }),
      ],
      existingOrders: [
        {
          idefixLineItemId: '1',
          quantity: 1,
          status: 'autoserved',
          stockLocation: 6,
          item: menuItem,
        },
        {
          idefixLineItemId: '2',
          quantity: 1,
          status: OrderStatus.CANCELLED,
          stockLocation: 6,
          item: menuItem,
        },
      ],
    });

    const entries = await service.getReservedStocks(6);

    expect(
      idefixClient.request.mock.calls.map((c) => c[2].params.state),
    ).toEqual([
      'created',
      'shipment_ready',
      'shipment_picking',
      'shipment_invoiced',
    ]);
    expect(entries).toEqual([
      {
        channel: 'idefix',
        orderNumber: 'IDE642eabe9bd3b2',
        product: 'london',
        quantity: 1,
      },
    ]);
  });

  it('açık sevkiyat yoksa veritabanına gitmez', async () => {
    const { service, orderService } = buildService();
    expect(await service.getReservedStocks(6)).toEqual([]);
    expect(orderService.findByIdefixLineItemIds).not.toHaveBeenCalled();
  });
});

describe('IdefixOrderService.processAcceptedClaims', () => {
  const claim = (state: string, orderLineId: number) => ({
    id: 241,
    orderNumber: 'IDE642eabe9bd3b2',
    items: [
      {
        id: 262,
        orderLineId,
        barcode: '3664824001505',
        productName: 'x',
        state,
      },
    ],
  });

  it('onaylanan iade satırının siparişini iptal eder', async () => {
    const { service, idefixClient, calls, webhookLogService } = buildService({
      claims: [claim('approved', 10000043), claim('waiting_vendor_approve', 5)],
      existingOrders: [
        { idefixLineItemId: '10000043', quantity: 1, status: 'autoserved' },
        { idefixLineItemId: '5', quantity: 1, status: 'autoserved' },
      ],
    });

    const result = await service.processAcceptedClaims();

    expect(idefixClient.request.mock.calls[0][1]).toBe(CLAIMS);
    // 30 gün önce, İstanbul saatiyle
    expect(idefixClient.request.mock.calls[0][2].params.lastUpdatedAt).toBe(
      '2026/09/14 12:30:00',
    );
    expect(calls).toEqual(['cancel:10000043:1']);
    expect(webhookLogService.logWebhookRequest).toHaveBeenCalledWith(
      WebhookSource.IDEFIX,
      'claim-approved',
      { lineItemIds: ['10000043'] },
    );
    expect(result.stats).toEqual({
      totalClaimsChecked: 2,
      approvedLines: 1,
      cancelled: 1,
      skipped: 0,
    });
  });

  it('daha önce iptal edilmiş ya da bulunamayan sipariş tekrar işlenmez', async () => {
    const { service, orderService } = buildService({
      claims: [claim('approved', 1), claim('approved', 2)],
      existingOrders: [
        { idefixLineItemId: '1', quantity: 1, status: OrderStatus.CANCELLED },
      ],
    });

    const result = await service.processAcceptedClaims();

    expect(orderService.cancelIdefixOrder).not.toHaveBeenCalled();
    expect(result.stats).toMatchObject({ cancelled: 0, skipped: 2 });
  });

  it('iptal hata verirse diğer satırlar işlenmeye devam eder', async () => {
    const { service, orderService, calls } = buildService({
      claims: [claim('approved', 1), claim('approved', 2)],
      existingOrders: [
        { idefixLineItemId: '1', quantity: 1, status: 'autoserved' },
        { idefixLineItemId: '2', quantity: 1, status: 'autoserved' },
      ],
    });
    orderService.cancelIdefixOrder.mockRejectedValueOnce(new Error('boom'));

    const result = await service.processAcceptedClaims();

    expect(calls).toEqual(['cancel:2:1']);
    expect(result.stats.cancelled).toBe(1);
  });
});
