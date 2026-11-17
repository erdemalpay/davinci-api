import { AmazonOrder } from './amazon.dto';
import {
  isSellableReturn,
  orderCreatedAt,
  parseReturnRows,
  planOrderActions,
  returnKey,
  toUnitPrice,
} from './amazon.mappers';

const order = (overrides: Partial<AmazonOrder> = {}): AmazonOrder => ({
  orderId: '402-8542665-4617950',
  createdTime: '2026-11-02T17:05:21.000Z',
  lastUpdatedTime: '2026-11-02T20:18:16.000Z',
  fulfillment: { fulfilledBy: 'AMAZON', fulfillmentStatus: 'SHIPPED' },
  orderItems: [
    {
      orderItemId: '111',
      quantityOrdered: 1,
      product: {
        sellerSku: 'X5-2DYG-L6FV',
        price: { unitPrice: { amount: '1350.0', currencyCode: 'TRY' } },
      },
    },
  ],
  ...overrides,
});

const withStatus = (fulfillmentStatus: any, fulfilledBy: any = 'AMAZON') =>
  order({ fulfillment: { fulfilledBy, fulfillmentStatus } });

describe('planOrderActions', () => {
  it.each(['UNSHIPPED', 'PARTIALLY_SHIPPED', 'SHIPPED', 'INVOICE_UNCONFIRMED'])(
    '%s statüsündeki siparişi açar',
    (status) => {
      const plan = planOrderActions([withStatus(status)]);
      expect(plan.creates).toHaveLength(1);
      expect(plan.cancelLineItemIds).toEqual([]);
    },
  );

  it('CANCELLED siparişin kalemlerini iptal listesine koyar', () => {
    const plan = planOrderActions([withStatus('CANCELLED')]);
    expect(plan.creates).toEqual([]);
    expect(plan.cancelLineItemIds).toEqual(['111']);
  });

  it.each(['PENDING', 'PENDING_AVAILABILITY', 'UNFULFILLABLE'])(
    '%s siparişe dokunmaz',
    (status) => {
      expect(planOrderActions([withStatus(status)])).toEqual({
        creates: [],
        cancelLineItemIds: [],
      });
    },
  );

  it("Amazon'un kendi çoklu kanal siparişlerini (S02-...) atlar", () => {
    const plan = planOrderActions([order({ orderId: 'S02-9498701-6712766' })]);
    expect(plan.creates).toEqual([]);
  });

  it('satıcının kendi gönderdiği (MERCHANT) siparişi atlar', () => {
    expect(
      planOrderActions([withStatus('SHIPPED', 'MERCHANT')]).creates,
    ).toEqual([]);
  });

  it('kalemi olmayan siparişi açmaz', () => {
    expect(planOrderActions([order({ orderItems: [] })]).creates).toEqual([]);
  });
});

describe('toUnitPrice', () => {
  const item = (amount: any) => ({
    orderItemId: '1',
    quantityOrdered: 1,
    product: { price: { unitPrice: { amount } } },
  });

  it('birim fiyatı sayıya çevirir', () => {
    expect(toUnitPrice(item('1350.0'))).toBe(1350);
  });

  it.each([undefined, '0', '-5', 'abc'])('%s için null döner', (amount) => {
    expect(toUnitPrice(item(amount))).toBeNull();
  });

  it('fiyat alanı hiç yoksa null döner', () => {
    expect(toUnitPrice({ orderItemId: '1', quantityOrdered: 1 })).toBeNull();
  });
});

describe('orderCreatedAt', () => {
  it('sipariş zamanını döner', () => {
    expect(orderCreatedAt(order()).toISOString()).toBe(
      '2026-11-02T17:05:21.000Z',
    );
  });

  it('geçersiz tarihte şimdiye düşer', () => {
    const date = orderCreatedAt(order({ createdTime: 'bozuk' }));
    expect(Number.isNaN(date.getTime())).toBe(false);
  });
});

const RETURN_HEADER = [
  'return-date',
  'order-id',
  'sku',
  'asin',
  'fnsku',
  'product-name',
  'quantity',
  'fulfillment-center-id',
  'detailed-disposition',
  'reason',
  'license-plate-number',
  'customer-comments',
].join('\t');

const returnLine = (overrides: Record<string, string> = {}) => {
  const values: Record<string, string> = {
    'return-date': '2026-10-29T16:20:03+00:00',
    'order-id': '404-3868489-3371530',
    sku: '6R-ZC7W-89XN',
    asin: 'B0GGRCDCPM',
    fnsku: 'X002HO3543',
    'product-name': 'Flip7',
    quantity: '1',
    'fulfillment-center-id': 'XSA9',
    'detailed-disposition': 'SELLABLE',
    reason: 'UNWANTED_ITEM',
    'license-plate-number': 'LPNUIN14971821',
    'customer-comments': 'Kutusunu açmadık.',
    ...overrides,
  };
  return RETURN_HEADER.split('\t')
    .map((column) => values[column])
    .join('\t');
};

describe('parseReturnRows', () => {
  it('başlık satırına göre iade satırlarını okur', () => {
    const rows = parseReturnRows(
      [RETURN_HEADER, returnLine(), returnLine({ quantity: '2' })].join('\n'),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      returnDate: '2026-10-29T16:20:03+00:00',
      orderId: '404-3868489-3371530',
      sku: '6R-ZC7W-89XN',
      quantity: 1,
      disposition: 'SELLABLE',
      reason: 'UNWANTED_ITEM',
      licensePlate: 'LPNUIN14971821',
    });
    expect(rows[1].quantity).toBe(2);
  });

  it('boş rapor ve yalnızca başlık için boş liste döner', () => {
    expect(parseReturnRows('')).toEqual([]);
    expect(parseReturnRows(RETURN_HEADER)).toEqual([]);
  });

  it('sipariş, sku ya da adedi geçersiz satırı atlar', () => {
    const rows = parseReturnRows(
      [
        RETURN_HEADER,
        returnLine({ 'order-id': '' }),
        returnLine({ sku: '' }),
        returnLine({ quantity: '0' }),
        returnLine({ quantity: 'x' }),
        returnLine(),
      ].join('\n'),
    );

    expect(rows).toHaveLength(1);
  });

  it('Windows satır sonlarını tolere eder', () => {
    expect(
      parseReturnRows([RETURN_HEADER, returnLine()].join('\r\n')),
    ).toHaveLength(1);
  });
});

describe('returnKey / isSellableReturn', () => {
  const row = parseReturnRows([RETURN_HEADER, returnLine()].join('\n'))[0];

  it('plaka kodu varsa onunla anahtar üretir', () => {
    expect(returnKey(row)).toBe(
      'LPNUIN14971821:404-3868489-3371530:6R-ZC7W-89XN',
    );
  });

  it('plaka kodu yoksa iade tarihine düşer', () => {
    expect(returnKey({ ...row, licensePlate: '' })).toBe(
      '2026-10-29T16:20:03+00:00:404-3868489-3371530:6R-ZC7W-89XN',
    );
  });

  it('yalnızca SELLABLE satılabilir iadedir', () => {
    expect(isSellableReturn(row)).toBe(true);
    expect(isSellableReturn({ ...row, disposition: 'DEFECTIVE' })).toBe(false);
    expect(isSellableReturn({ ...row, disposition: 'CUSTOMER_DAMAGED' })).toBe(
      false,
    );
  });
});
