import { N11Product, N11ShipmentPackage } from './n11.dto';
import {
  findN11ProductByBarcode,
  formatN11Date,
  mapClaimReturn,
  packageCreatedAt,
  planPackageActions,
  toArray,
  toN11Price,
  toUnitPrice,
} from './n11.mappers';

/** n11 sipariş listeleme doc'undaki örnek paketten kısaltıldı. */
const line = (overrides: Partial<N11ShipmentPackage['lines'][0]> = {}) => ({
  orderLineId: 415490391,
  productId: 123456789,
  productName: 'Erkek Spor Ayakkabı Bordo 45',
  stockCode: '20242024',
  barcode: null,
  quantity: 2,
  price: 292.8,
  sellerInvoiceAmount: 579.8,
  orderItemLineItemStatusName: 'Picking',
  ...overrides,
});

const pkg = (
  overrides: Partial<N11ShipmentPackage> = {},
): N11ShipmentPackage => ({
  id: '112999455244259',
  orderNumber: '203872347637',
  shipmentPackageStatus: 'Picking',
  lastModifiedDate: 1724323386203,
  packageHistories: [
    { createdDate: 1724274054460, status: 'Created' },
    { createdDate: 1724274255751, status: 'Picking' },
  ],
  lines: [line()],
  ...overrides,
});

describe('planPackageActions', () => {
  it('aktif paketteki satırı oluşturmaya ayırır', () => {
    const result = planPackageActions([pkg()]);
    expect(result.creates).toHaveLength(1);
    expect(result.creates[0].lines.map((l) => l.orderLineId)).toEqual([
      415490391,
    ]);
    expect(result.cancelLineItemIds).toEqual([]);
  });

  it.each(['Created', 'Picking', 'Shipped', 'Delivered'] as const)(
    '%s paketi oluşturulur',
    (status) => {
      const result = planPackageActions([
        pkg({ shipmentPackageStatus: status }),
      ]);
      expect(result.creates).toHaveLength(1);
    },
  );

  it.each(['Cancelled', 'UnSupplied', 'Unpacked'] as const)(
    '%s paketin tüm satırları iptale gider',
    (status) => {
      const result = planPackageActions([
        pkg({
          shipmentPackageStatus: status,
          lines: [line(), line({ orderLineId: 2 })],
        }),
      ]);
      expect(result.creates).toEqual([]);
      expect(result.cancelLineItemIds).toEqual(['415490391', '2']);
    },
  );

  it('aktif pakette iptal edilen satır iptale, diğeri oluşturmaya gider', () => {
    const result = planPackageActions([
      pkg({
        lines: [
          line({ orderLineId: 1 }),
          line({ orderLineId: 2, orderItemLineItemStatusName: 'Cancelled' }),
        ],
      }),
    ]);
    expect(result.creates[0].lines.map((l) => l.orderLineId)).toEqual([1]);
    expect(result.cancelLineItemIds).toEqual(['2']);
  });

  it('bölünmede yeni paket oluşturulur, eski paket iptal edilir', () => {
    const result = planPackageActions([
      pkg({
        id: 'old',
        shipmentPackageStatus: 'Unpacked',
        lines: [line({ orderLineId: 10 })],
      }),
      pkg({
        id: 'new',
        shipmentPackageStatus: 'Picking',
        lines: [line({ orderLineId: 11, quantity: 1 })],
      }),
    ]);
    expect(result.creates.map((c) => c.pkg.id)).toEqual(['new']);
    expect(result.cancelLineItemIds).toEqual(['10']);
  });

  it('aynı satır iki kez gelirse iptal listesinde bir kez bulunur', () => {
    const cancelled = pkg({ shipmentPackageStatus: 'Cancelled' });
    const result = planPackageActions([cancelled, cancelled]);
    expect(result.cancelLineItemIds).toEqual(['415490391']);
  });
});

describe('toUnitPrice', () => {
  it('mağaza fatura tutarını adede böler ve 2 haneye yuvarlar', () => {
    expect(toUnitPrice(line({ sellerInvoiceAmount: 579.8, quantity: 2 }))).toBe(
      289.9,
    );
    expect(toUnitPrice(line({ sellerInvoiceAmount: 100, quantity: 3 }))).toBe(
      33.33,
    );
  });

  it('fatura tutarı yoksa birim fiyatı kullanır', () => {
    expect(
      toUnitPrice(line({ sellerInvoiceAmount: undefined, price: 250 })),
    ).toBe(250);
  });
});

describe('packageCreatedAt', () => {
  it('Created geçmiş kaydının tarihini döner (baştaki boşluğa dayanıklı)', () => {
    expect(packageCreatedAt(pkg()).getTime()).toBe(1724274054460);
    expect(
      packageCreatedAt(
        pkg({ packageHistories: [{ createdDate: 5, status: ' Created' }] }),
      ).getTime(),
    ).toBe(5);
  });

  it('Created kaydı yoksa şimdiyi döner', () => {
    const before = Date.now();
    const result = packageCreatedAt(pkg({ packageHistories: [] })).getTime();
    expect(result).toBeGreaterThanOrEqual(before);
  });
});

describe('findN11ProductByBarcode', () => {
  const products = [
    { stockCode: 'flip7', barcode: '8684917956944' },
    { stockCode: 'karakum', barcode: '2013947' },
    { stockCode: '1111', barcode: null },
  ] as N11Product[];

  it('barkod eşleşmesi', () => {
    expect(findN11ProductByBarcode(products, '8684917956944')?.stockCode).toBe(
      'flip7',
    );
  });

  it('stockCode barkoda eşitse eşleşir', () => {
    expect(findN11ProductByBarcode(products, '1111')?.stockCode).toBe('1111');
  });

  it('baştaki sıfırlar farklıysa yine eşleşir', () => {
    expect(findN11ProductByBarcode(products, '0000002013947')?.stockCode).toBe(
      'karakum',
    );
  });

  it('eşleşme yoksa undefined', () => {
    expect(findN11ProductByBarcode(products, '999')).toBeUndefined();
  });
});

describe('biçim yardımcıları', () => {
  it('toN11Price 2 haneye yuvarlar', () => {
    expect(toN11Price(1499.999)).toBe(1500);
    expect(toN11Price(1399.904)).toBe(1399.9);
  });

  it('formatN11Date İstanbul saatine göre dd/mm/yyyy', () => {
    expect(formatN11Date(new Date('2026-10-11T22:30:00Z'))).toBe('12/10/2026');
  });

  it('toArray tek nesneyi diziye çevirir', () => {
    expect(toArray(undefined)).toEqual([]);
    expect(toArray({ a: 1 })).toEqual([{ a: 1 }]);
    expect(toArray([1, 2])).toEqual([1, 2]);
  });

  it('mapClaimReturn SOAP kaydını tipli nesneye çevirir', () => {
    expect(
      mapClaimReturn({
        claimReturnId: '25391658',
        status: 'APPROVED',
        orderNumber: '123456789000',
        productId: '623456789',
        productName: 'Deneme',
        quantity: '2',
        returnReasonType: 'Hasarlı Paket',
      }),
    ).toEqual({
      claimReturnId: '25391658',
      status: 'APPROVED',
      orderNumber: '123456789000',
      productId: '623456789',
      productName: 'Deneme',
      quantity: 2,
      returnReasonType: 'Hasarlı Paket',
    });
  });
});
