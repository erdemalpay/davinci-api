jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { Logger } from '@nestjs/common';
import { OrderStatus } from '../order/order.dto';
import { RedisKeys } from '../redis/redis.dto';
import { WebhookSource } from '../webhook-log/webhook-log.schema';
import { StockHistoryStatusEnum } from '../accounting/accounting.dto';
import { AmazonOrder } from './amazon.dto';
import { AmazonOrderService } from './amazon-order.service';

const NOW = new Date('2026-11-17T09:30:00Z').getTime();

const order = (overrides: Partial<AmazonOrder> = {}): AmazonOrder => ({
  orderId: '402-8542665-4617950',
  createdTime: '2026-11-17T09:00:00.000Z',
  lastUpdatedTime: '2026-11-17T09:10:00.000Z',
  fulfillment: { fulfilledBy: 'AMAZON', fulfillmentStatus: 'UNSHIPPED' },
  orderItems: [
    {
      orderItemId: '111',
      quantityOrdered: 2,
      product: {
        sellerSku: 'X5-2DYG-L6FV',
        price: { unitPrice: { amount: '1350.0', currencyCode: 'TRY' } },
      },
    },
  ],
  ...overrides,
});

function buildService(
  options: {
    pages?: Array<{ orders?: AmazonOrder[]; nextToken?: string }>;
    existingOrders?: any[];
    cursor?: number | null;
    menuItem?: any;
    returnReport?: string;
    activeOrders?: any[];
    processedKeys?: string[];
    transferError?: Error;
  } = {},
) {
  const {
    pages = [{ orders: [] }],
    existingOrders = [],
    cursor = null,
    menuItem = { _id: 55, name: 'Love Letter', matchedProduct: 'p' },
    returnReport = '',
    activeOrders = [],
    processedKeys = [],
    transferError,
  } = options;

  const calls: string[] = [];
  const redisStore: Record<string, any> = {
    [RedisKeys.AmazonOrderSyncCursor]: cursor,
  };
  let pageIndex = 0;
  const amazonClient = {
    getReport: jest.fn<Promise<string>, any[]>(async () => returnReport),
    request: jest.fn<Promise<any>, any[]>(async () => {
      const page = pages[pageIndex++] ?? { orders: [] };
      return {
        orders: page.orders,
        pagination: page.nextToken ? { nextToken: page.nextToken } : undefined,
      };
    }),
  };

  let nextOrderId = 1000;
  const orderService = {
    findByAmazonLineItemId: jest.fn(
      async (id: string) =>
        existingOrders.find((o) => o.amazonLineItemId === id) ?? null,
    ),
    createOrder: jest.fn<Promise<any>, any[]>(async (_u, dto) => {
      calls.push(`create:${dto.amazonLineItemId}`);
      return { _id: ++nextOrderId };
    }),
    createCollection: jest.fn<Promise<any>, any[]>(async () => ({ _id: 1 })),
    cancelAmazonOrder: jest.fn<Promise<any>, any[]>(async (_u, id, qty) => {
      calls.push(`cancel:${id}:${qty}`);
      return {};
    }),
    findActiveAmazonOrdersByOrderNumberAndItem: jest.fn<Promise<any[]>, any[]>(
      async () => activeOrders,
    ),
  };
  const accountingService = {
    stockTransfer: jest.fn<Promise<any>, any[]>(async (...args) => {
      if (transferError) throw transferError;
      calls.push(`transfer:${args[1]}->${args[2]}:${args[3]}:${args[4]}`);
      return {};
    }),
  };
  const processed = new Set(processedKeys);
  const processedReturnModel = {
    exists: jest.fn<Promise<any>, any[]>(async ({ returnKey }) =>
      processed.has(returnKey) ? { _id: 1 } : null,
    ),
    create: jest.fn<Promise<any>, any[]>(async (doc) => {
      processed.add(doc.returnKey);
      return doc;
    }),
  };
  const menuService = {
    findByAmazonSku: jest.fn(async (sku: string) =>
      sku === 'X5-2DYG-L6FV' || sku === '6R-ZC7W-89XN' ? menuItem : null,
    ),
  };
  const userService = {
    findByIdWithoutPopulate: jest.fn(async () => ({ _id: 'dv' })),
  };
  const webhookLogService = {
    logWebhookRequest: jest.fn(async () => ({ _id: 7 })),
    updateWebhookResponse: jest.fn<Promise<any>, any[]>(async () => ({})),
  };
  const websocketGateway = { emitOrderGroupChanged: jest.fn() };
  const redisService = {
    get: jest.fn(async (key: string) => redisStore[key] ?? null),
    set: jest.fn(async (key: string, value: any) => {
      redisStore[key] = value;
      return 'OK';
    }),
  };

  const service = new AmazonOrderService(
    amazonClient as never,
    orderService as never,
    menuService as never,
    userService as never,
    webhookLogService as never,
    websocketGateway as never,
    redisService as never,
    accountingService as never,
    processedReturnModel as never,
  );
  for (const level of ['log', 'debug', 'warn', 'error'] as const) {
    jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
  }

  return {
    service,
    amazonClient,
    orderService,
    webhookLogService,
    websocketGateway,
    accountingService,
    processedReturnModel,
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

describe('AmazonOrderService.syncOrders', () => {
  it('ilk turda son 1 saati sorar ve siparişi Amazon stok konumundan açar', async () => {
    const { service, amazonClient, orderService } = buildService({
      pages: [{ orders: [order()] }],
    });

    const result = await service.syncOrders();

    expect(result).toEqual({
      skipped: false,
      orders: 1,
      created: 1,
      cancelled: 0,
    });
    const params = amazonClient.request.mock.calls[0][2].params;
    expect(params.lastUpdatedAfter).toBe(
      new Date(NOW - 60 * 60 * 1000).toISOString(),
    );
    expect(params.includedData).toBe('FULFILLMENT');
    expect(params.marketplaceIds).toBe('A33AVAJ2PDY3EV');

    const dto = orderService.createOrder.mock.calls[0][1];
    expect(dto).toMatchObject({
      item: 55,
      quantity: 2,
      unitPrice: 1350,
      status: OrderStatus.AUTOSERVED,
      location: 4,
      stockLocation: 3,
      stockNote: StockHistoryStatusEnum.AMAZONORDERCREATE,
      paymentMethod: 'amazon',
      isOnlineSale: true,
      amazonOrderNumber: '402-8542665-4617950',
      amazonLineItemId: '111',
    });
    expect(dto.createdAt).toEqual(new Date('2026-11-17T09:00:00.000Z'));
  });

  it('sipariş başına tek tahsilat açar (tutar = adet × birim fiyat)', async () => {
    const { service, orderService } = buildService({
      pages: [{ orders: [order()] }],
    });

    await service.syncOrders();

    expect(orderService.createCollection).toHaveBeenCalledTimes(1);
    expect(orderService.createCollection.mock.calls[0][1]).toMatchObject({
      paymentMethod: WebhookSource.AMAZON,
      amount: 2700,
      amazonOrderNumber: '402-8542665-4617950',
      orders: [{ order: 1001, paidQuantity: 2 }],
    });
  });

  it('sonraki turda cursor - 30 dakikadan sorar', async () => {
    const cursor = NOW - 10 * 60 * 1000;
    const { service, amazonClient, redisStore } = buildService({ cursor });

    await service.syncOrders();

    expect(amazonClient.request.mock.calls[0][2].params.lastUpdatedAfter).toBe(
      new Date(cursor - 30 * 60 * 1000).toISOString(),
    );
    expect(redisStore[RedisKeys.AmazonOrderSyncCursor]).toBe(NOW);
  });

  it('sayfaları paginationToken ile sonuna kadar gezer', async () => {
    const second = order({ orderId: '403-1111111-2222222' });
    second.orderItems![0].orderItemId = '222';
    const { service, amazonClient } = buildService({
      pages: [{ orders: [order()], nextToken: 'tok-1' }, { orders: [second] }],
    });

    const result = await service.syncOrders();

    expect(result).toMatchObject({ orders: 2, created: 2 });
    expect(amazonClient.request.mock.calls[1][2].params.paginationToken).toBe(
      'tok-1',
    );
  });

  it('boş sayfada token gelse bile döngüden çıkar', async () => {
    const { service, amazonClient } = buildService({
      pages: [{ orders: [], nextToken: 'tok-1' }],
    });

    await service.syncOrders();

    expect(amazonClient.request).toHaveBeenCalledTimes(1);
  });

  it('daha önce açılmış kalemi tekrar açmaz', async () => {
    const { service, orderService } = buildService({
      pages: [{ orders: [order()] }],
      existingOrders: [{ amazonLineItemId: '111' }],
    });

    const result = await service.syncOrders();

    expect(result).toMatchObject({ created: 0 });
    expect(orderService.createOrder).not.toHaveBeenCalled();
  });

  it('eşleşmeyen SKU için sipariş açmaz ve webhook kaydına yazar', async () => {
    const unknown = order();
    unknown.orderItems![0].product!.sellerSku = 'YOK-SKU';
    const { service, orderService, webhookLogService } = buildService({
      pages: [{ orders: [unknown] }],
    });

    const result = await service.syncOrders();

    expect(result).toMatchObject({ created: 0 });
    expect(orderService.createOrder).not.toHaveBeenCalled();
    expect(webhookLogService.updateWebhookResponse.mock.calls[0][1]).toEqual(
      expect.objectContaining({ unmatchedSkus: ['YOK-SKU'] }),
    );
  });

  it('ürünle eşleşip stok ürünü bağlanmamışsa açmaz', async () => {
    const { service, orderService } = buildService({
      pages: [{ orders: [order()] }],
      menuItem: { _id: 55, name: 'Love Letter', matchedProduct: undefined },
    });

    const result = await service.syncOrders();

    expect(result).toMatchObject({ created: 0 });
    expect(orderService.createOrder).not.toHaveBeenCalled();
  });

  it('fiyatı olmayan kalemi açmaz', async () => {
    const noPrice = order();
    noPrice.orderItems![0].product!.price = undefined;
    const { service, orderService } = buildService({
      pages: [{ orders: [noPrice] }],
    });

    const result = await service.syncOrders();

    expect(result).toMatchObject({ created: 0 });
    expect(orderService.createOrder).not.toHaveBeenCalled();
  });

  it('iptal edilen siparişin kalemini tüm adediyle iptal eder', async () => {
    const cancelled = order({
      fulfillment: { fulfilledBy: 'AMAZON', fulfillmentStatus: 'CANCELLED' },
    });
    const { service, calls } = buildService({
      pages: [{ orders: [cancelled] }],
      existingOrders: [
        {
          amazonLineItemId: '111',
          quantity: 2,
          status: OrderStatus.AUTOSERVED,
        },
      ],
    });

    const result = await service.syncOrders();

    expect(result).toMatchObject({ created: 0, cancelled: 1 });
    expect(calls).toEqual(['cancel:111:2']);
  });

  it("Amazon'un iç siparişini (S02-) satışa çevirmez", async () => {
    const { service, orderService } = buildService({
      pages: [{ orders: [order({ orderId: 'S02-9498701-6712766' })] }],
    });

    const result = await service.syncOrders();

    expect(result).toMatchObject({ orders: 1, created: 0 });
    expect(orderService.createOrder).not.toHaveBeenCalled();
  });

  it('sipariş değişince panele haber verir, değişmediyse vermez', async () => {
    const withOrder = buildService({ pages: [{ orders: [order()] }] });
    await withOrder.service.syncOrders();
    expect(withOrder.websocketGateway.emitOrderGroupChanged).toHaveBeenCalled();

    const empty = buildService();
    await empty.service.syncOrders();
    expect(empty.websocketGateway.emitOrderGroupChanged).not.toHaveBeenCalled();
  });

  it('hata olursa cursor ilerlemez', async () => {
    const { service, amazonClient, redisStore } = buildService({ cursor: 123 });
    amazonClient.request.mockRejectedValueOnce(new Error('429'));

    await expect(service.syncOrders()).rejects.toThrow('429');

    expect(redisStore[RedisKeys.AmazonOrderSyncCursor]).toBe(123);
  });
});

describe('AmazonOrderService.processAcceptedClaims', () => {
  const header = [
    'return-date',
    'order-id',
    'sku',
    'quantity',
    'detailed-disposition',
    'reason',
    'license-plate-number',
  ].join('\t');
  const line = (overrides: Partial<Record<string, string>> = {}): string => {
    const values: Record<string, string> = {
      'return-date': '2026-11-10T10:00:00+00:00',
      'order-id': '404-3868489-3371530',
      sku: '6R-ZC7W-89XN',
      quantity: '1',
      'detailed-disposition': 'SELLABLE',
      reason: 'UNWANTED_ITEM',
      'license-plate-number': 'LPN1',
      ...overrides,
    };
    return header
      .split('\t')
      .map((column) => values[column])
      .join('\t');
  };
  const report = (...lines: string[]) => [header, ...lines].join('\n');
  const active = (quantity: number, lineItemId = '111') => ({
    amazonLineItemId: lineItemId,
    quantity,
  });

  it("satılabilir iadede siparişi iptal eder, Kayıplar'a aktarmaz", async () => {
    const { service, calls, processedReturnModel } = buildService({
      returnReport: report(line()),
      activeOrders: [active(1)],
    });

    const result = await service.processAcceptedClaims();

    expect(calls).toEqual(['cancel:111:1']);
    expect(result.stats).toMatchObject({
      totalReturnsChecked: 1,
      cancelled: 1,
      movedToLost: 0,
      errors: 0,
    });
    expect(processedReturnModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        returnKey: 'LPN1:404-3868489-3371530:6R-ZC7W-89XN',
        action: 'CANCELLED',
        success: true,
      }),
    );
  });

  it("hasarlı iadede siparişi iptal eder ve adedi Amazon'dan Kayıplar'a aktarır", async () => {
    const { service, calls, processedReturnModel } = buildService({
      returnReport: report(line({ 'detailed-disposition': 'DEFECTIVE' })),
      activeOrders: [active(1)],
    });

    const result = await service.processAcceptedClaims();

    expect(calls).toEqual(['cancel:111:1', 'transfer:3->8:p:1']);
    expect(result.stats).toMatchObject({ cancelled: 1, movedToLost: 1 });
    expect(processedReturnModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CANCELLED_TO_LOST', success: true }),
    );
  });

  it('iade adedini siparişlere sırayla dağıtır (kısmi iptal)', async () => {
    const { service, calls } = buildService({
      returnReport: report(line({ quantity: '3' })),
      activeOrders: [active(2, '111'), active(2, '222')],
    });

    await service.processAcceptedClaims();

    expect(calls).toEqual(['cancel:111:2', 'cancel:222:1']);
  });

  it('daha önce işlenmiş iadeyi tekrar işlemez', async () => {
    const { service, calls } = buildService({
      returnReport: report(line()),
      activeOrders: [active(1)],
      processedKeys: ['LPN1:404-3868489-3371530:6R-ZC7W-89XN'],
    });

    const result = await service.processAcceptedClaims();

    expect(calls).toEqual([]);
    expect(result.stats).toMatchObject({ skipped: 1, cancelled: 0 });
  });

  it('aynı çalışmada tekrarlanan iade satırını da bir kez işler', async () => {
    const { service, calls } = buildService({
      returnReport: report(line(), line()),
      activeOrders: [active(1)],
    });

    await service.processAcceptedClaims();

    expect(calls).toEqual(['cancel:111:1']);
  });

  it('siparişi bulunamayan iadeyi işaretler ve bir daha denemez', async () => {
    const { service, calls, processedReturnModel } = buildService({
      returnReport: report(line()),
      activeOrders: [],
    });

    const result = await service.processAcceptedClaims();

    expect(calls).toEqual([]);
    expect(result.stats).toMatchObject({ notFound: 1, cancelled: 0 });
    expect(processedReturnModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ORDER_NOT_FOUND' }),
    );
  });

  it("eşleşmeyen SKU'lu iadeyi sipariş bulunamadı sayar", async () => {
    const { service, calls } = buildService({
      returnReport: report(line({ sku: 'YOK-SKU' })),
      activeOrders: [active(1)],
    });

    const result = await service.processAcceptedClaims();

    expect(calls).toEqual([]);
    expect(result.stats).toMatchObject({ notFound: 1 });
  });

  it('aktarım hata verirse iptali korur, hatayı kayda yazar ve tekrar iptal etmez', async () => {
    const { service, calls, processedReturnModel } = buildService({
      returnReport: report(line({ 'detailed-disposition': 'DEFECTIVE' })),
      activeOrders: [active(1)],
      transferError: new Error('Stock not found'),
    });

    const result = await service.processAcceptedClaims();

    expect(calls).toEqual(['cancel:111:1']);
    expect(result.stats).toMatchObject({
      cancelled: 1,
      movedToLost: 0,
      errors: 1,
    });
    expect(processedReturnModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CANCELLED',
        success: false,
        errorMessage: 'Stock not found',
      }),
    );
  });

  it('boş rapor için hiçbir şey yapmaz ve panele haber vermez', async () => {
    const { service, websocketGateway } = buildService({ returnReport: '' });

    const result = await service.processAcceptedClaims();

    expect(result.stats).toMatchObject({ totalReturnsChecked: 0 });
    expect(websocketGateway.emitOrderGroupChanged).not.toHaveBeenCalled();
  });

  it('iptal olunca panele haber verir', async () => {
    const { service, websocketGateway } = buildService({
      returnReport: report(line()),
      activeOrders: [active(1)],
    });

    await service.processAcceptedClaims();

    expect(websocketGateway.emitOrderGroupChanged).toHaveBeenCalledTimes(1);
  });

  it('son 30 günün iade raporunu ister', async () => {
    const { service, amazonClient } = buildService({ returnReport: '' });

    await service.processAcceptedClaims();

    const [type, start, end] = amazonClient.getReport.mock.calls[0];
    expect(type).toBe('GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA');
    expect(end.getTime() - start.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
