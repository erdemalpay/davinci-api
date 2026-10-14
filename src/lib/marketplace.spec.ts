import {
  findByBarcode,
  hasOnlinePrice,
  roundPrice,
  sumStockQuantity,
} from './marketplace';

describe('findByBarcode', () => {
  const items = [
    { barcode: '0653341025005', stockCode: 'scythe' },
    { barcode: '123', stockCode: 'b' },
    { barcode: null, stockCode: 'kod' },
  ];

  it('birebir barkodu bulur', () => {
    expect(findByBarcode(items, '123')?.stockCode).toBe('b');
  });

  it('baştaki sıfırlar farklıysa da bulur', () => {
    expect(findByBarcode(items, '653341025005')?.stockCode).toBe('scythe');
  });

  it('birebir eşleşme kuralı değiştirilebilir', () => {
    expect(
      findByBarcode(items, 'kod', (i) => i.stockCode === 'kod')?.stockCode,
    ).toBe('kod');
  });

  it('yoksa undefined döner', () => {
    expect(findByBarcode(items, '999')).toBeUndefined();
  });
});

describe('fiyat ve stok yardımcıları', () => {
  it('roundPrice 2 haneye yuvarlar', () => {
    expect(roundPrice(1300.456)).toBe(1300.46);
  });

  it('hasOnlinePrice yalnızca pozitif sayıyı kabul eder', () => {
    expect([1250, 0, null, undefined, '1250'].map(hasOnlinePrice)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('sumStockQuantity boş adetleri 0 sayar', () => {
    expect(sumStockQuantity([{ quantity: 2 }, {}, { quantity: 3 }])).toBe(5);
  });
});
