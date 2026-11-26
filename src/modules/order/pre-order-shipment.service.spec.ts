jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePreOrderShipmentDto, OrderStatus } from './order.dto';
import { PreOrderShipmentService } from './pre-order-shipment.service';

type Row = {
  _id: number;
  shopifyOrderId?: string;
  shopifyOrderLineItemId?: string;
  status?: string;
  quantity: number;
  isShipped?: boolean;
  preOrderShipmentShopifyOrderId?: string;
  item?: { name: string };
};

function buildService(rows: Row[]) {
  // find() hem populate'li (create) hem doğrudan await edilen (emit) çağrıda kullanılıyor.
  const orderModel = {
    find: jest.fn(() =>
      Object.assign(Promise.resolve(rows), {
        populate: jest.fn(async () => rows),
      }),
    ),
    updateMany: jest.fn(async () => ({ modifiedCount: 1 })),
  };
  const shopifyService = {
    getPreOrderShipmentSource: jest.fn(async () => ({
      orderNumber: '5580',
      customerId: 'gid://shopify/Customer/1',
      email: 'musteri@example.com',
    })),
    createPreOrderShipmentOrder: jest.fn(async () => ({
      id: '19087171846201',
      name: '#8268',
    })),
    getFulfillmentOrdersForOrder: jest.fn(async (): Promise<unknown[]> => []),
    createFulfillmentWithTracking: jest.fn(async () => '555'),
  };
  const websocketGateway = { emitOrderUpdated: jest.fn() };
  const accountingService = { invalidateReservedStocks: jest.fn() };

  const service = new PreOrderShipmentService(
    orderModel as never,
    shopifyService as never,
    websocketGateway as never,
    accountingService as never,
  );
  const logger = (service as unknown as { logger: object }).logger;
  for (const level of ['log', 'warn', 'error'] as const) {
    jest
      .spyOn(logger as never, level as never)
      .mockImplementation((() => undefined) as never);
  }

  return {
    service,
    orderModel,
    shopifyService,
    websocketGateway,
    accountingService,
  };
}

describe('PreOrderShipmentService.create', () => {
  it('ayni orijinalin kalemlerini tek kopyada toplar ve kopyayi kayitlara yazar', async () => {
    const { service, orderModel, shopifyService, websocketGateway } =
      buildService([
        {
          _id: 1,
          shopifyOrderId: '100',
          quantity: 1,
          item: { name: 'Flip7 Daha Acımasız' },
        },
        {
          _id: 2,
          shopifyOrderId: '100',
          quantity: 1,
          item: { name: 'Kale Kombo Zindandan Kaçış Ek Paket' },
        },
      ]);

    const result = await service.create([1, 2]);

    expect(shopifyService.createPreOrderShipmentOrder).toHaveBeenCalledTimes(1);
    const [input] = shopifyService.createPreOrderShipmentOrder.mock
      .calls[0] as unknown as [{ note: string }];
    expect(input.note).toBe(
      [
        'Ön sipariş gönderimi - orijinal sipariş #5580',
        'Flip7 Daha Acımasız',
        'Kale Kombo Zindandan Kaçış Ek Paket',
      ].join('\n'),
    );
    expect(orderModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [1, 2] } },
      {
        preOrderShipmentShopifyOrderId: '19087171846201',
        preOrderShipmentShopifyOrderNumber: '#8268',
      },
    );
    expect(websocketGateway.emitOrderUpdated).toHaveBeenCalledTimes(1);
    expect(result.created).toEqual([
      { shopifyOrderId: '100', shipmentOrderNumber: '#8268' },
    ]);
  });

  it('Shopify hatasinda grup failed olur, kayitlara yazilmaz', async () => {
    const { service, orderModel, shopifyService } = buildService([
      { _id: 1, shopifyOrderId: '100', quantity: 1, item: { name: 'Flip7' } },
    ]);
    shopifyService.createPreOrderShipmentOrder.mockRejectedValueOnce(
      new Error('userErrors'),
    );

    const result = await service.create([1]);

    expect(orderModel.updateMany).not.toHaveBeenCalled();
    expect(result.failed).toEqual([
      { shopifyOrderId: '100', message: 'userErrors' },
    ]);
  });

  it('kopya acildi ama panele yazilamadiysa hata mesajinda kopya numarasi olur', async () => {
    const { service, orderModel } = buildService([
      { _id: 1, shopifyOrderId: '100', quantity: 1, item: { name: 'Flip7' } },
    ]);
    orderModel.updateMany.mockRejectedValueOnce(new Error('db down'));

    const result = await service.create([1]);

    expect(result.created).toEqual([]);
    expect(result.failed).toEqual([
      {
        shopifyOrderId: '100',
        message:
          'Shipment order #8268 was created in Shopify but could not be linked in the panel: db down',
      },
    ]);
  });

  it('#6803: iptal kalem skipped doner, Shopify a gidilmez', async () => {
    const { service, shopifyService } = buildService([
      {
        _id: 1,
        shopifyOrderId: '100',
        quantity: 1,
        status: OrderStatus.CANCELLED,
      },
    ]);

    const result = await service.create([1]);

    expect(shopifyService.createPreOrderShipmentOrder).not.toHaveBeenCalled();
    expect(result.skipped).toEqual([{ orderId: 1, reason: 'CANCELLED' }]);
  });
});

describe('CreatePreOrderShipmentDto', () => {
  it('bos diziyi reddeder', async () => {
    const errors = await validate(
      plainToInstance(CreatePreOrderShipmentDto, { orderIds: [] }),
    );
    expect(errors).toHaveLength(1);
  });

  it('sayi olmayan id yi reddeder', async () => {
    const errors = await validate(
      plainToInstance(CreatePreOrderShipmentDto, { orderIds: ['x'] }),
    );
    expect(errors).toHaveLength(1);
  });

  it('gecerli id listesini kabul eder', async () => {
    const errors = await validate(
      plainToInstance(CreatePreOrderShipmentDto, { orderIds: [1, 2] }),
    );
    expect(errors).toHaveLength(0);
  });
});

describe('PreOrderShipmentService.handleShipmentFulfilled', () => {
  const shipmentOrderId = '19087171846201';
  const payload = {
    id: 19087171846201,
    fulfillments: [
      { tracking_number: 'DVB19087171846201', tracking_company: 'HepsiJet' },
    ],
  };
  const linkedRow = (over: Partial<Row> = {}): Row => ({
    _id: 1,
    shopifyOrderId: '100',
    shopifyOrderLineItemId: '11',
    quantity: 1,
    preOrderShipmentShopifyOrderId: shipmentOrderId,
    ...over,
  });

  it('kopya degilse hicbir sey yapmaz', async () => {
    const { service, shopifyService } = buildService([]);

    expect(await service.handleShipmentFulfilled(payload)).toBeUndefined();
    expect(shopifyService.getFulfillmentOrdersForOrder).not.toHaveBeenCalled();
  });

  it('orijinalde yalnizca kopyadaki satiri takip numarasiyla kapatir', async () => {
    const {
      service,
      orderModel,
      shopifyService,
      websocketGateway,
      accountingService,
    } = buildService([linkedRow()]);
    shopifyService.getFulfillmentOrdersForOrder.mockResolvedValueOnce([
      {
        id: 'gid://shopify/FulfillmentOrder/1',
        status: 'OPEN',
        deliveryMethod: { methodType: 'SHIPPING' },
        lineItems: {
          edges: [
            {
              node: {
                id: 'gid://shopify/FulfillmentOrderLineItem/1',
                remainingQuantity: 1,
                lineItem: { id: 'gid://shopify/LineItem/11' },
              },
            },
            {
              node: {
                id: 'gid://shopify/FulfillmentOrderLineItem/2',
                remainingQuantity: 1,
                lineItem: { id: 'gid://shopify/LineItem/22' },
              },
            },
          ],
        },
      },
    ]);

    const result = await service.handleShipmentFulfilled(payload);

    expect(shopifyService.getFulfillmentOrdersForOrder).toHaveBeenCalledWith(
      '100',
    );
    expect(shopifyService.createFulfillmentWithTracking).toHaveBeenCalledWith(
      {
        fulfillmentOrderId: 'gid://shopify/FulfillmentOrder/1',
        fulfillmentOrderLineItems: [
          { id: 'gid://shopify/FulfillmentOrderLineItem/1', quantity: 1 },
        ],
        lineItemIds: ['11'],
      },
      { number: 'DVB19087171846201', company: 'HepsiJet' },
    );
    expect(orderModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [1] } },
      { isShipped: true, shopifyFulfillmentId: '555' },
    );
    expect(websocketGateway.emitOrderUpdated).toHaveBeenCalledTimes(1);
    expect(accountingService.invalidateReservedStocks).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      closedFulfillmentOrders: 1,
      markedShipped: 1,
      failedOrders: [],
    });
  });

  it('26 Kasim: orijinalde satir zaten kapaliysa yalnizca panel isaretlenir', async () => {
    const { service, orderModel, shopifyService } = buildService([linkedRow()]);

    await service.handleShipmentFulfilled(payload);

    expect(shopifyService.createFulfillmentWithTracking).not.toHaveBeenCalled();
    expect(orderModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [1] } },
      { isShipped: true },
    );
  });

  it('takip numarasi yoksa orijinal kapatilmaz', async () => {
    const { service, orderModel, shopifyService } = buildService([linkedRow()]);

    const result = await service.handleShipmentFulfilled({
      id: 19087171846201,
      fulfillments: [],
    });

    expect(shopifyService.getFulfillmentOrdersForOrder).not.toHaveBeenCalled();
    expect(orderModel.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      closedFulfillmentOrders: 0,
      markedShipped: 0,
      failedOrders: [],
      skippedReason: 'NO_TRACKING',
    });
  });

  it('Shopify hatasinda orijinal failedOrders a yazilir, panel isaretlenmez', async () => {
    const { service, orderModel, shopifyService } = buildService([linkedRow()]);
    shopifyService.getFulfillmentOrdersForOrder.mockRejectedValueOnce(
      new Error('timeout'),
    );

    const result = await service.handleShipmentFulfilled(payload);

    expect(orderModel.updateMany).not.toHaveBeenCalled();
    expect(result?.failedOrders).toEqual(['100']);
  });
});
