jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { planRefundActions } from './shopify.refund-plan';
import { ShopifyService } from './shopify.service';

const shippingLine = (amount: string) => ({
  subtotal_amount_set: { shop_money: { amount, currency_code: 'TRY' } },
});

// #6136 — log 10537: sadece kargo ücreti iade edildi, ürün müşteride.
const REFUND_6136 = {
  id: 951724245049,
  order_id: 6689929527353,
  note: 'Kargo ücreti iadesi',
  restock: false,
  refund_line_items: [],
  refund_shipping_lines: [shippingLine('135.00')],
  order_adjustments: [
    { kind: 'refund_discrepancy', amount: '135.00' },
    { kind: 'shipping_refund', amount: '-135.00' },
  ],
  transactions: [{ kind: 'refund', status: 'pending', amount: '135.00' }],
};

// #5834 — log 9939: iki ürün + kargo birlikte iade edildi (sipariş komple iptal).
const REFUND_5834 = {
  id: 950000000001,
  order_id: 6671834611769,
  note: 'Müşteri isteği ile iptal edildi',
  refund_line_items: [
    { line_item_id: 1001, quantity: 1, restock_type: 'cancel', subtotal: 349 },
    { line_item_id: 1002, quantity: 1, restock_type: 'cancel', subtotal: 1749 },
  ],
  refund_shipping_lines: [shippingLine('135.00')],
  transactions: [{ kind: 'refund', status: 'pending', amount: '2233.00' }],
};

describe('planRefundActions — kargo iadesi', () => {
  it('#6136: sadece kargo iadesi -> tek kargo aksiyonu, ürün iptal edilmez', () => {
    expect(planRefundActions(REFUND_6136)).toEqual([
      { type: 'shipping_refund', amount: 135, refundId: '951724245049' },
    ]);
  });

  it('#5834: ürün iptalleri önce, kargo iadesi en sonda gelir', () => {
    expect(planRefundActions(REFUND_5834)).toEqual([
      { type: 'cancel', lineItemId: '1001', quantity: 1, restock: true },
      { type: 'cancel', lineItemId: '1002', quantity: 1, restock: true },
      { type: 'shipping_refund', amount: 135, refundId: '950000000001' },
    ]);
  });

  it('orders/cancelled formatında refunds[] içindeki kargo iadesini de tanır', () => {
    expect(
      planRefundActions({
        id: 6689929527353,
        refunds: [
          {
            id: 951724245049,
            refund_line_items: [],
            refund_shipping_lines: [shippingLine('135.00')],
            transactions: [{ kind: 'refund', amount: '135.00' }],
          },
        ],
      }),
    ).toEqual([
      { type: 'shipping_refund', amount: 135, refundId: '951724245049' },
    ]);
  });

  it('kısmi ürün iadesi + kargo: kargo parası ürün satırına yazılmaz', () => {
    expect(
      planRefundActions({
        id: 77,
        refund_line_items: [
          {
            line_item_id: 5,
            quantity: 1,
            restock_type: 'no_restock',
            subtotal: 100,
          },
        ],
        refund_shipping_lines: [shippingLine('135.00')],
        transactions: [{ kind: 'refund', amount: '185.00' }],
      }),
    ).toEqual([
      { type: 'refund', lineItemId: '5', refundAmount: 50, refundId: '77' },
      { type: 'shipping_refund', amount: 135, refundId: '77' },
    ]);
  });

  it('0 TL kargo satırı aksiyon üretmez', () => {
    expect(
      planRefundActions({
        id: 1,
        refund_line_items: [],
        refund_shipping_lines: [shippingLine('0.00')],
      }),
    ).toEqual([]);
  });
});

describe('ShopifyService.orderCancelWebHook — kargo iadesi', () => {
  const buildService = () => {
    const orderService = {
      cancelShopifyOrder: jest.fn(async () => ({})),
      refundShopifyOrderLine: jest.fn(async () => ({})),
      refundShopifyShipping: jest.fn(async () => ({})),
    };
    const service = new ShopifyService(
      { get: jest.fn(() => 'example.myshopify.com') } as never,
      {} as never,
      {} as never,
      orderService as never,
      {} as never,
      {} as never,
      {
        findByIdWithoutPopulate: jest.fn(async () => ({ _id: 'dv' })),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        logWebhookRequest: jest.fn(async () => ({ _id: 1 })),
        updateWebhookResponse: jest.fn(async () => undefined),
      } as never,
      {} as never,
      {} as never,
    );
    const logger = (service as any).logger;
    for (const level of ['log', 'debug', 'warn', 'error'] as const) {
      jest.spyOn(logger, level).mockImplementation(() => undefined);
    }
    return { service, orderService };
  };

  it('#6136: refunds/create formatında sipariş id order_id alanından alınır', async () => {
    const { service, orderService } = buildService();

    const response = await service.orderCancelWebHook(REFUND_6136);

    expect(orderService.refundShopifyShipping).toHaveBeenCalledWith(
      '6689929527353',
      135,
      '951724245049',
    );
    expect(orderService.cancelShopifyOrder).not.toHaveBeenCalled();
    expect(response).toMatchObject({ shippingRefundsProcessed: 1 });
  });

  it('orders/cancelled formatında sipariş id kök id alanından alınır', async () => {
    const { service, orderService } = buildService();

    await service.orderCancelWebHook({
      id: 6689929527353,
      refunds: [
        {
          id: 951724245049,
          refund_line_items: [],
          refund_shipping_lines: [shippingLine('135.00')],
        },
      ],
    });

    expect(orderService.refundShopifyShipping).toHaveBeenCalledWith(
      '6689929527353',
      135,
      '951724245049',
    );
  });

  it('#5834: kargo iadesi ürün iptallerinden SONRA çağrılır', async () => {
    const { service, orderService } = buildService();
    const calls: string[] = [];
    orderService.cancelShopifyOrder.mockImplementation(async () => {
      calls.push('cancel');
      return {};
    });
    orderService.refundShopifyShipping.mockImplementation(async () => {
      calls.push('shipping');
      return {};
    });

    await service.orderCancelWebHook(REFUND_5834);

    expect(calls).toEqual(['cancel', 'cancel', 'shipping']);
  });
});
