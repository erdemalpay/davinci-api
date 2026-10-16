jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { N11Service } from './n11.service';

const PRODUCTS = [
  {
    stockCode: 'flip7',
    barcode: '8684917956944',
    quantity: 20,
    salePrice: 1500,
    listPrice: 1500,
  },
  {
    stockCode: 'karakum',
    barcode: '8684917956937',
    quantity: 20,
    salePrice: 1000,
    listPrice: 1000,
  },
];

function buildService(
  options: {
    menuItems?: any[];
    allItems?: any[];
    stockByProduct?: Record<string, number>;
    writesEnabled?: boolean;
  } = {},
) {
  const {
    menuItems = [],
    allItems = [],
    stockByProduct = {},
    writesEnabled = true,
  } = options;

  let taskId = 100;
  const n11Client = {
    integrator: 'davinci',
    writesEnabled,
    assertWritesEnabled: jest.fn(() => {
      if (!writesEnabled) throw new Error('writes disabled');
    }),
    request: jest.fn(async (method: string, path: string) => {
      if (path === '/ms/product-query') {
        return { content: PRODUCTS, totalPages: 1, totalElements: 2 };
      }
      if (path === '/ms/product/tasks/price-stock-update') {
        return { id: ++taskId, status: 'IN_QUEUE', reasons: [] };
      }
      throw new Error(`unexpected ${method} ${path}`);
    }),
  };
  const menuService = {
    findItemsWithN11StockCode: jest.fn(async () => menuItems),
    findAllItems: jest.fn(async () => allItems),
    updateItemField: jest.fn(async () => ({})),
  };
  const accountingService = {
    findProductStockByLocation: jest.fn(async (product: string) =>
      product in stockByProduct ? [{ quantity: stockByProduct[product] }] : [],
    ),
  };

  const service = new N11Service(
    n11Client as never,
    menuService as never,
    accountingService as never,
  );
  const logger = (service as any).logger;
  for (const level of ['log', 'debug', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }

  const sentSkus = () =>
    n11Client.request.mock.calls
      .filter(([, path]) => path === '/ms/product/tasks/price-stock-update')
      .map(([, , opts]: any) => opts.body.payload);

  return { service, n11Client, menuService, accountingService, sentSkus };
}

describe('N11Service.updateAllStocks', () => {
  it('yalnızca farklı olan stokları, fiyat alanı olmadan gönderir', async () => {
    const { service, sentSkus } = buildService({
      menuItems: [
        { name: 'Flip7', n11StockCode: 'flip7', matchedProduct: 'p-flip' },
        { name: 'Karakum', n11StockCode: 'karakum', matchedProduct: 'p-kara' },
      ],
      stockByProduct: { 'p-flip': 7, 'p-kara': 20 },
    });

    const result = await service.updateAllStocks();

    expect(sentSkus()).toEqual([
      { integrator: 'davinci', skus: [{ stockCode: 'flip7', quantity: 7 }] },
    ]);
    expect(result).toEqual({
      total: 2,
      updated: 1,
      skipped: 0,
      taskIds: [101],
    });
  });

  it('n11de olmayan stockCode atlanır', async () => {
    const { service, sentSkus } = buildService({
      menuItems: [{ name: 'X', n11StockCode: 'yok', matchedProduct: 'p' }],
    });

    const result = await service.updateAllStocks();

    expect(sentSkus()).toEqual([]);
    expect(result.skipped).toBe(1);
  });
});

describe('N11Service.updateAllPrices', () => {
  it('online fiyatı liste=satış olarak gönderir, online fiyatı olmayana dokunmaz', async () => {
    const { service, sentSkus } = buildService({
      menuItems: [
        {
          name: 'Flip7',
          n11StockCode: 'flip7',
          matchedProduct: 'a',
          onlinePrice: 1399.9,
          price: 1200,
        },
        {
          name: 'Karakum',
          n11StockCode: 'karakum',
          matchedProduct: 'b',
          onlinePrice: undefined,
          price: 900,
        },
      ],
    });

    const result = await service.updateAllPrices();

    expect(sentSkus()).toEqual([
      {
        integrator: 'davinci',
        skus: [{ stockCode: 'flip7', listPrice: 1399.9, salePrice: 1399.9 }],
      },
    ]);
    expect(result.noOnlinePrice).toEqual(['Karakum']);
  });

  it('fiyat aynıysa göndermez', async () => {
    const { service, sentSkus } = buildService({
      menuItems: [
        {
          name: 'Flip7',
          n11StockCode: 'flip7',
          matchedProduct: 'a',
          onlinePrice: 1500,
        },
      ],
    });

    const result = await service.updateAllPrices();

    expect(sentSkus()).toEqual([]);
    expect(result.updated).toBe(0);
  });
});

describe('N11Service.matchItemsByBarcode', () => {
  it('eşleşeni kaydeder ve online fiyatını n11e gönderir', async () => {
    const { service, menuService, sentSkus } = buildService({
      allItems: [
        { _id: 1, name: 'Flip7', barcode: '8684917956944', onlinePrice: 1450 },
        { _id: 2, name: 'Karakum', barcode: '8684917956937' },
        { _id: 3, name: 'Barkodsuz' },
        { _id: 4, name: 'Yok', barcode: '999' },
        { _id: 5, name: 'Seçilmemiş', barcode: '8684917956944' },
      ],
    });

    const result = await service.matchItemsByBarcode([1, 2, 3, 4]);

    expect(menuService.updateItemField).toHaveBeenCalledWith(1, {
      n11StockCode: 'flip7',
    });
    expect(menuService.updateItemField).toHaveBeenCalledWith(2, {
      n11StockCode: 'karakum',
    });
    expect(menuService.updateItemField).toHaveBeenCalledTimes(2);
    expect(sentSkus()).toEqual([
      {
        integrator: 'davinci',
        skus: [{ stockCode: 'flip7', listPrice: 1450, salePrice: 1450 }],
      },
    ]);
    expect(result).toMatchObject({
      total: 4,
      matched: 2,
      notFound: 1,
      noBarcode: 1,
      taskIds: [101],
    });
    expect(result.results.find((r) => r.itemId === 2)?.price).toBe(
      'no_online_price',
    );
  });

  it('yazma kapalıysa eşleştirir ama fiyat göndermez', async () => {
    const { service, menuService, sentSkus } = buildService({
      writesEnabled: false,
      allItems: [
        { _id: 1, name: 'Flip7', barcode: '8684917956944', onlinePrice: 1450 },
      ],
    });

    const result = await service.matchItemsByBarcode([1]);

    expect(menuService.updateItemField).toHaveBeenCalledTimes(1);
    expect(sentSkus()).toEqual([]);
    expect(result.results[0].price).toBe('writes_disabled');
  });
  it('stok kodu başka bir ürüne bağlıysa eşleştirmez', async () => {
    const { service, menuService, sentSkus } = buildService({
      allItems: [
        { _id: 1, name: 'Flip7', barcode: '8684917956944', onlinePrice: 1450 },
        { _id: 2, name: 'Flip7 Hasarlı', barcode: '8684917956944' },
        { _id: 3, name: 'Eski', n11StockCode: 'karakum', deleted: true },
        { _id: 4, name: 'Karakum', barcode: '8684917956937' },
        { _id: 5, name: 'Karakum Hasarlı', n11StockCode: 'karakum' },
      ],
    });

    const result = await service.matchItemsByBarcode([1, 2, 4]);

    expect(menuService.updateItemField).toHaveBeenCalledTimes(1);
    expect(menuService.updateItemField).toHaveBeenCalledWith(1, {
      n11StockCode: 'flip7',
    });
    expect(sentSkus()[0].skus).toEqual([
      { stockCode: 'flip7', listPrice: 1450, salePrice: 1450 },
    ]);
    expect(result).toMatchObject({ matched: 1, alreadyMatched: 2 });
    expect(result.results.find((r) => r.itemId === 2)).toMatchObject({
      status: 'already_matched',
      matchedItemId: 1,
    });
    expect(result.results.find((r) => r.itemId === 4)).toMatchObject({
      status: 'already_matched',
      matchedItemId: 5,
    });
  });

  it('kendi stok koduyla tekrar eşleştirmek sorun değil', async () => {
    const { service, menuService } = buildService({
      allItems: [
        {
          _id: 1,
          name: 'Flip7',
          barcode: '8684917956944',
          n11StockCode: 'flip7',
        },
      ],
    });

    const result = await service.matchItemsByBarcode([1]);

    expect(menuService.updateItemField).toHaveBeenCalledTimes(1);
    expect(result.matched).toBe(1);
  });
});

describe('N11Service kancaları (pushStock / pushPrice)', () => {
  it('pushStock tek SKU yollar, ürün listesini çekmez', async () => {
    const { service, n11Client, sentSkus } = buildService();

    await expect(service.pushStock('flip7', 3)).resolves.toBe(true);

    expect(sentSkus()).toEqual([
      { integrator: 'davinci', skus: [{ stockCode: 'flip7', quantity: 3 }] },
    ]);
    expect(n11Client.request).toHaveBeenCalledTimes(1);
  });

  it('negatif stok 0 gönderilir', async () => {
    const { service, sentSkus } = buildService();
    await service.pushStock('flip7', -2);
    expect(sentSkus()[0].skus[0].quantity).toBe(0);
  });

  it('yazma kapalıysa sessizce false döner', async () => {
    const { service, n11Client } = buildService({ writesEnabled: false });

    await expect(service.pushStock('flip7', 3)).resolves.toBe(false);
    await expect(service.pushPrice('flip7', 10)).resolves.toBe(false);
    expect(n11Client.request).not.toHaveBeenCalled();
  });

  it('istek hatası yutulur', async () => {
    const { service, n11Client } = buildService();
    n11Client.request.mockRejectedValueOnce(new Error('down'));

    await expect(service.pushPrice('flip7', 10)).resolves.toBe(false);
  });
});

describe('N11Service SKU batch', () => {
  it('1000den fazla SKU ayrı isteklere bölünür', async () => {
    const menuItems = Array.from({ length: 1001 }, (_, i) => ({
      name: `i${i}`,
      n11StockCode: 'flip7',
      matchedProduct: `p${i}`,
    }));
    const { service, sentSkus } = buildService({ menuItems });

    const result = await service.updateAllStocks();

    expect(sentSkus().map((p) => p.skus.length)).toEqual([1000, 1]);
    expect(result.taskIds).toEqual([101, 102]);
  });

  it('REJECT dönen task hata fırlatır', async () => {
    const { service, n11Client } = buildService();
    n11Client.request.mockResolvedValueOnce({
      id: 1,
      status: 'REJECT',
      reasons: ['geçersiz'],
    });

    await expect(service.updateStock('flip7', 1)).rejects.toThrow(/geçersiz/);
  });
});
