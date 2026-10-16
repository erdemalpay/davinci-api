import {
  formatIdefixDate,
  shipmentCreatedAt,
  toUnitPrice,
} from './idefix.mappers';

describe('toUnitPrice', () => {
  const base = { id: 1, barcode: 'b', productName: 'p', price: 100 };

  it('satıcının fatura tutarını (vendorAmount) kullanır', () => {
    expect(
      toUnitPrice({ ...base, discountedTotalPrice: 90, vendorAmount: 95.555 }),
    ).toBe(95.56);
  });

  it('vendorAmount yoksa indirimli tutara, o da yoksa fiyata düşer', () => {
    expect(toUnitPrice({ ...base, discountedTotalPrice: 90 })).toBe(90);
    expect(toUnitPrice({ ...base, discountedTotalPrice: 0 })).toBe(100);
  });
});

describe('shipmentCreatedAt', () => {
  const shipment = {
    id: 1,
    orderNumber: 'IDE1',
    status: 'created' as const,
    createdAt: '2026-10-14T11:27:52+03:00',
    updatedAt: '2026-10-14T11:27:52+03:00',
    items: [],
  };

  it('sipariş tarihini, yoksa oluşturulma tarihini kullanır', () => {
    expect(
      shipmentCreatedAt({
        ...shipment,
        orderDate: '2026-10-14T11:24:25+03:00',
      }),
    ).toEqual(new Date('2026-10-14T08:24:25Z'));
    expect(shipmentCreatedAt(shipment)).toEqual(
      new Date('2026-10-14T08:27:52Z'),
    );
  });
});

describe('formatIdefixDate', () => {
  it('İstanbul saatiyle yyyy/MM/dd HH:mm:ss biçimler', () => {
    expect(formatIdefixDate(new Date('2026-10-14T21:05:09Z'))).toBe(
      '2026/10/15 00:05:09',
    );
  });
});
