import { PickupFulfillmentOrder } from '../shopify/shopify.pickup-plan';
import { OrderStatus } from './order.dto';
import {
  buildPreOrderShipmentInput,
  extractShipmentTracking,
  planPreOrderShipmentFulfillment,
  selectShippableOrders,
  ShippableCandidate,
} from './pre-order-shipment.plan';

const candidate = (
  over: Partial<ShippableCandidate> = {},
): ShippableCandidate => ({
  _id: 1,
  shopifyOrderId: '100',
  status: OrderStatus.PENDING,
  ...over,
});

/** foLine id = 'FOL-' + lineItemId */
const fo = (
  id: string,
  lines: [string, number][],
  status = 'OPEN',
): PickupFulfillmentOrder => ({
  id,
  status,
  methodType: 'SHIPPING',
  lineItems: lines.map(([lineItemId, remainingQuantity]) => ({
    id: `FOL-${lineItemId}`,
    lineItemId,
    remainingQuantity,
  })),
});

describe('selectShippableOrders', () => {
  it('uygun kayitlari orijinal Shopify siparisine gore gruplar', () => {
    const { groups, skipped } = selectShippableOrders([
      candidate({ _id: 1, shopifyOrderId: '100' }),
      candidate({ _id: 2, shopifyOrderId: '100' }),
      candidate({ _id: 3, shopifyOrderId: '200' }),
    ]);

    expect([...groups.keys()]).toEqual(['100', '200']);
    expect(groups.get('100')?.map((o) => o._id)).toEqual([1, 2]);
    expect(skipped).toEqual([]);
  });

  it('#6803: iptal edilmis kalem kopyaya girmez', () => {
    const { groups, skipped } = selectShippableOrders([
      candidate({ _id: 1, status: OrderStatus.CANCELLED }),
    ]);

    expect(groups.size).toBe(0);
    expect(skipped).toEqual([{ orderId: 1, reason: 'CANCELLED' }]);
  });

  it('gonderilmis, gel-al, kopyasi olan ve Shopify disi kalemleri atlar', () => {
    const { groups, skipped } = selectShippableOrders([
      candidate({ _id: 1, isShipped: true }),
      candidate({ _id: 2, isShopifyPickUp: true }),
      candidate({ _id: 3, preOrderShipmentShopifyOrderId: '999' }),
      candidate({ _id: 4, shopifyOrderId: undefined }),
    ]);

    expect(groups.size).toBe(0);
    expect(skipped).toEqual([
      { orderId: 1, reason: 'ALREADY_SHIPPED' },
      { orderId: 2, reason: 'PICK_UP' },
      { orderId: 3, reason: 'HAS_SHIPMENT' },
      { orderId: 4, reason: 'NOT_SHOPIFY' },
    ]);
  });
});

describe('buildPreOrderShipmentInput', () => {
  const source = {
    orderNumber: '5580',
    customerId: 'gid://shopify/Customer/1',
    email: 'musteri@example.com',
    shippingAddress: {
      firstName: 'Ayse',
      lastName: 'Yilmaz',
      address1: 'Bozkurt Mah. 20/1',
      city: 'Istanbul',
      countryCode: 'TR',
      phone: '+905550000000',
    },
  };

  it('#5580: Erdem in kopyasiyla ayni satir, not, etiket ve kargo satiri', () => {
    const input = buildPreOrderShipmentInput(source, [
      { title: 'Flip7 Daha Acımasız', quantity: 1 },
      { title: 'Uzaklar Perdenin Ötesinde Ek Paket', quantity: 1 },
      { title: 'Kale Kombo Zindandan Kaçış Ek Paket', quantity: 1 },
    ]);

    const content =
      'Flip7 Daha Acımasız + Uzaklar Perdenin Ötesinde Ek Paket + Kale Kombo Zindandan Kaçış Ek Paket';
    expect(input.lineItems).toEqual([
      {
        title: `Ön Sipariş - 5580 (${content})`,
        quantity: 1,
        priceSet: { shopMoney: { amount: '0.00', currencyCode: 'TRY' } },
        requiresShipping: true,
        taxable: false,
      },
    ]);
    // Notta ürünler alt alta.
    expect(input.note).toBe(
      [
        'Ön sipariş gönderimi - orijinal sipariş #5580',
        'Flip7 Daha Acımasız',
        'Uzaklar Perdenin Ötesinde Ek Paket',
        'Kale Kombo Zindandan Kaçış Ek Paket',
      ].join('\n'),
    );
    expect(input.tags).toEqual(['on-siparis-gonderim']);
    expect(input.financialStatus).toBe('PAID');
    expect(input.currency).toBe('TRY');
    expect(input.shippingLines).toEqual([
      {
        title: 'Ücretsiz Kargo',
        priceSet: { shopMoney: { amount: '0.00', currencyCode: 'TRY' } },
      },
    ]);
  });

  it('13 Kasim hatasi: musteri, e-posta ve adres orijinalden baglanir', () => {
    const input = buildPreOrderShipmentInput(source, [
      { title: 'Derinsu Lordları', quantity: 1 },
    ]);

    expect(input.customer).toEqual({
      toAssociate: { id: 'gid://shopify/Customer/1' },
    });
    expect(input.email).toBe('musteri@example.com');
    expect(input.shippingAddress).toEqual(source.shippingAddress);
  });

  it('#5801: adet 1 den buyukse basina "2x" yazilir', () => {
    const input = buildPreOrderShipmentInput(
      { ...source, orderNumber: '5801' },
      [
        { title: 'Flip7 Daha Acımasız', quantity: 2 },
        { title: 'Kale Kombo Zindandan Kaçış Ek Paket', quantity: 1 },
      ],
    );

    expect(input.note).toBe(
      [
        'Ön sipariş gönderimi - orijinal sipariş #5801',
        '2x Flip7 Daha Acımasız',
        'Kale Kombo Zindandan Kaçış Ek Paket',
      ].join('\n'),
    );
    expect(input.lineItems[0].title).toBe(
      'Ön Sipariş - 5801 (2x Flip7 Daha Acımasız + Kale Kombo Zindandan Kaçış Ek Paket)',
    );
  });
});

describe('planPreOrderShipmentFulfillment', () => {
  it('#5991: kopyadaki Flip7 ve Flash 10 kapanir, gelmemis dnup acik kalir', () => {
    const plan = planPreOrderShipmentFulfillment(
      [
        { shopifyOrderLineItemId: 'flip7', quantity: 1 },
        { shopifyOrderLineItemId: 'flash10', quantity: 1 },
      ],
      [
        fo('FO1', [['flip7', 1]]),
        fo('FO2', [['flash10', 1]]),
        fo('FO3', [['dnup', 1]]),
      ],
    );

    expect(plan).toEqual([
      {
        fulfillmentOrderId: 'FO1',
        fulfillmentOrderLineItems: [{ id: 'FOL-flip7', quantity: 1 }],
        lineItemIds: ['flip7'],
      },
      {
        fulfillmentOrderId: 'FO2',
        fulfillmentOrderLineItems: [{ id: 'FOL-flash10', quantity: 1 }],
        lineItemIds: ['flash10'],
      },
    ]);
  });

  it('17 Kasim hatasi: ayni pakette bekleyen diger kalemlere dokunulmaz', () => {
    const plan = planPreOrderShipmentFulfillment(
      [{ shopifyOrderLineItemId: 'derinsu', quantity: 1 }],
      [
        fo('FO1', [
          ['derinsu', 1],
          ['flip7', 1],
          ['uzaklar', 1],
        ]),
      ],
    );

    expect(plan).toEqual([
      {
        fulfillmentOrderId: 'FO1',
        fulfillmentOrderLineItems: [{ id: 'FOL-derinsu', quantity: 1 }],
        lineItemIds: ['derinsu'],
      },
    ]);
  });

  it('26 Kasim: orijinalde kalem zaten kapaliysa plan bos doner', () => {
    const plan = planPreOrderShipmentFulfillment(
      [{ shopifyOrderLineItemId: 'flip7', quantity: 1 }],
      [fo('FO1', [['flip7', 0]], 'CLOSED')],
    );

    expect(plan).toEqual([]);
  });

  it('adet kalan adetten fazla olamaz', () => {
    const plan = planPreOrderShipmentFulfillment(
      [{ shopifyOrderLineItemId: 'flip7', quantity: 2 }],
      [fo('FO1', [['flip7', 1]])],
    );

    expect(plan[0].fulfillmentOrderLineItems).toEqual([
      { id: 'FOL-flip7', quantity: 1 },
    ]);
  });
});

describe('extractShipmentTracking', () => {
  it('orders/fulfilled payload inda son fulfillment in takip numarasini alir', () => {
    expect(
      extractShipmentTracking({
        fulfillments: [
          { tracking_number: null },
          {
            tracking_number: 'DVB19007791005753',
            tracking_company: 'HepsiJet',
          },
        ],
      }),
    ).toEqual({ number: 'DVB19007791005753', company: 'HepsiJet' });
  });

  it('takip numarasi yoksa undefined doner', () => {
    expect(extractShipmentTracking({ fulfillments: [] })).toBeUndefined();
    expect(extractShipmentTracking({})).toBeUndefined();
  });
});
