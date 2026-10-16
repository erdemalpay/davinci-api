jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { IdefixService } from './idefix.service';

const INVENTORY = [
  {
    barcode: '3664824001505',
    stockCode: 'nextstationlondon',
    price: 1250,
    comparePrice: 1250,
    inventoryQuantity: 0,
  },
  {
    barcode: '0653341025005',
    stockCode: 'scythe',
    price: 0,
    comparePrice: 0,
    inventoryQuantity: 3,
  },
];

const INVENTORY_LIST = '/pim/catalog/28163/inventory/list';
const INVENTORY_UPLOAD = '/pim/catalog/28163/inventory-upload';

function buildService(
  options: {
    menuItems?: any[];
    allItems?: any[];
    stockByProduct?: Record<string, number>;
    writesEnabled?: boolean;
    inventory?: any[];
  } = {},
) {
  const {
    menuItems = [],
    allItems = [],
    stockByProduct = {},
    writesEnabled = true,
    inventory = INVENTORY,
  } = options;

  let batch = 0;
  const idefixClient = {
    writesEnabled,
    assertWritesEnabled: jest.fn(() => {
      if (!writesEnabled) throw new Error('writes disabled');
    }),
    request: jest.fn<Promise<any>, any[]>(async (method, path) => {
      if (path === INVENTORY_LIST) {
        return { items: inventory, pageCount: 1 };
      }
      if (path === INVENTORY_UPLOAD) {
        return { status: 'CREATED', batchRequestId: `b-${++batch}` };
      }
      throw new Error(`unexpected ${method} ${path}`);
    }),
  };
  const menuService = {
    findItemsWithIdefixBarcode: jest.fn(async () => menuItems),
    findAllItems: jest.fn(async () => allItems),
    findByIdefixBarcode: jest.fn(async (barcode: string) =>
      allItems.find((i) => i.idefixBarcode === barcode),
    ),
    updateItemField: jest.fn(async () => ({})),
  };
  const accountingService = {
    findProductStockByLocation: jest.fn(async (product: string) =>
      product in stockByProduct ? [{ quantity: stockByProduct[product] }] : [],
    ),
  };

  const service = new IdefixService(
    idefixClient as never,
    menuService as never,
    accountingService as never,
  );
  const logger = (service as any).logger;
  for (const level of ['log', 'debug', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }

  const sentItems = () =>
    idefixClient.request.mock.calls
      .filter(([, path]) => path === INVENTORY_UPLOAD)
      .map(([, , opts]) => opts.body.items);

  return { service, idefixClient, menuService, accountingService, sentItems };
}

const london = {
  _id: 1,
  name: 'Next Station London',
  idefixBarcode: '3664824001505',
  barcode: '3664824001505',
  matchedProduct: 'p-london',
  onlinePrice: 1250,
};
const scythe = {
  _id: 2,
  name: 'Scythe',
  idefixBarcode: '0653341025005',
  barcode: '653341025005',
  matchedProduct: 'p-scythe',
  onlinePrice: 5400,
};

describe('IdefixService.updateAllStocks', () => {
  it('yalnızca stoğu farklı olanları fiyatla birlikte gönderir', async () => {
    const { service, sentItems } = buildService({
      menuItems: [london, scythe],
      stockByProduct: { 'p-london': 4, 'p-scythe': 3 },
    });

    const result = await service.updateAllStocks();

    expect(sentItems()).toEqual([
      [
        {
          barcode: '3664824001505',
          price: 1250,
          comparePrice: 1250,
          inventoryQuantity: 4,
        },
      ],
    ]);
    expect(result).toMatchObject({ total: 2, updated: 1, skipped: 0 });
    expect(result.batchRequestIds).toEqual(['b-1']);
  });

  it('online fiyatı boş ürünü göndermez ve raporlar', async () => {
    const { service, sentItems } = buildService({
      menuItems: [{ ...london, onlinePrice: undefined }],
      stockByProduct: { 'p-london': 4 },
    });

    const result = await service.updateAllStocks();

    expect(sentItems()).toEqual([]);
    expect(result.noOnlinePrice).toEqual(['Next Station London']);
  });

  it("idefix'te bulunmayan barkodu atlar", async () => {
    const { service, sentItems } = buildService({
      menuItems: [{ ...london, idefixBarcode: '999' }],
    });

    const result = await service.updateAllStocks();

    expect(sentItems()).toEqual([]);
    expect(result).toMatchObject({ updated: 0, skipped: 1 });
  });

  it('200 kalemden fazlasını parçalara bölerek gönderir', async () => {
    const inventory = Array.from({ length: 450 }, (_, i) => ({
      barcode: `b${i}`,
      price: 0,
      comparePrice: 0,
      inventoryQuantity: 0,
    }));
    const menuItems = inventory.map((inv, i) => ({
      name: `item${i}`,
      idefixBarcode: inv.barcode,
      matchedProduct: 'p',
      onlinePrice: 100,
    }));
    const { service, sentItems } = buildService({
      menuItems,
      inventory,
      stockByProduct: { p: 1 },
    });

    const result = await service.updateAllStocks();

    expect(sentItems().map((items) => items.length)).toEqual([200, 200, 50]);
    expect(result.batchRequestIds).toEqual(['b-1', 'b-2', 'b-3']);
  });
});

describe('IdefixService.updateAllPrices', () => {
  it('yalnızca fiyatı farklı olanları güncel stokla gönderir', async () => {
    const { service, sentItems } = buildService({
      menuItems: [london, scythe],
      stockByProduct: { 'p-london': 0, 'p-scythe': 3 },
    });

    const result = await service.updateAllPrices();

    expect(sentItems()).toEqual([
      [
        {
          barcode: '0653341025005',
          price: 5400,
          comparePrice: 5400,
          inventoryQuantity: 3,
        },
      ],
    ]);
    expect(result.updated).toBe(1);
  });
});

describe('IdefixService.matchItemsByBarcode', () => {
  it('barkodu eşleştirir, idefix barkodunu kaydeder, stok ve fiyatı gönderir', async () => {
    const item = { ...scythe, idefixBarcode: undefined };
    const { service, menuService, sentItems } = buildService({
      allItems: [item],
      stockByProduct: { 'p-scythe': 2 },
    });

    const result = await service.matchItemsByBarcode([2]);

    // Menüde baştaki sıfır yok; idefix'teki hali kaydedilir.
    expect(menuService.updateItemField).toHaveBeenCalledWith(2, {
      idefixBarcode: '0653341025005',
    });
    expect(sentItems()).toEqual([
      [
        {
          barcode: '0653341025005',
          price: 5400,
          comparePrice: 5400,
          inventoryQuantity: 2,
        },
      ],
    ]);
    expect(result).toMatchObject({ matched: 1, batchRequestIds: ['b-1'] });
    expect(result.results[0].inventory).toBe('sent');
  });

  it('barkodu başka ürüne bağlıysa (Hasarlı kopya) eşleştirmez', async () => {
    const damaged = {
      ...london,
      _id: 9,
      name: 'Next Station London (Hasarlı)',
      idefixBarcode: undefined,
    };
    const { service, menuService, sentItems } = buildService({
      allItems: [london, damaged],
    });

    const result = await service.matchItemsByBarcode([9]);

    expect(menuService.updateItemField).not.toHaveBeenCalled();
    expect(sentItems()).toEqual([]);
    expect(result.results[0]).toMatchObject({
      status: 'already_matched',
      matchedItemId: 1,
    });
  });

  it('barkodsuz, bulunamayan ve fiyatsız ürünleri ayrı raporlar', async () => {
    const { service, sentItems } = buildService({
      allItems: [
        { _id: 3, name: 'Barkodsuz' },
        { _id: 4, name: 'Yok', barcode: '111' },
        { ...london, idefixBarcode: undefined, onlinePrice: 0 },
      ],
    });

    const result = await service.matchItemsByBarcode([1, 3, 4]);

    expect(result).toMatchObject({ matched: 1, notFound: 1, noBarcode: 1 });
    expect(result.results.find((r) => r.itemId === 1)?.inventory).toBe(
      'no_online_price',
    );
    expect(sentItems()).toEqual([]);
  });

  it('yazma kapalıyken eşleştirir ama göndermez', async () => {
    const { service, menuService, sentItems } = buildService({
      allItems: [{ ...london, idefixBarcode: undefined }],
      writesEnabled: false,
    });

    const result = await service.matchItemsByBarcode([1]);

    expect(menuService.updateItemField).toHaveBeenCalled();
    expect(sentItems()).toEqual([]);
    expect(result.results[0].inventory).toBe('writes_disabled');
  });
});

describe('IdefixService tekil gönderimler', () => {
  it('pushStock online fiyatı yoksa göndermez', async () => {
    const { service, sentItems } = buildService();

    await expect(service.pushStock('3664824001505', 5, null)).resolves.toBe(
      false,
    );
    expect(sentItems()).toEqual([]);
  });

  it('pushStock yazma kapalıyken göndermez', async () => {
    const { service, sentItems } = buildService({ writesEnabled: false });

    await expect(service.pushStock('3664824001505', 5, 1250)).resolves.toBe(
      false,
    );
    expect(sentItems()).toEqual([]);
  });

  it('pushStock hata olursa ana akışı bozmaz', async () => {
    const { service, idefixClient } = buildService();
    idefixClient.request.mockRejectedValueOnce(new Error('429'));

    await expect(service.pushStock('3664824001505', 5, 1250)).resolves.toBe(
      false,
    );
  });

  it('pushPrice mağaza stoğunu fiyatın yanına ekler', async () => {
    const { service, sentItems } = buildService({
      stockByProduct: { 'p-london': 7 },
    });

    await service.pushPrice('3664824001505', 1300.456, 'p-london');

    expect(sentItems()).toEqual([
      [
        {
          barcode: '3664824001505',
          price: 1300.46,
          comparePrice: 1300.46,
          inventoryQuantity: 7,
        },
      ],
    ]);
  });

  it('updateStock online fiyatı olmayan üründe hata verir', async () => {
    const { service } = buildService({
      allItems: [{ ...london, onlinePrice: undefined }],
    });

    await expect(service.updateStock('3664824001505', 3)).rejects.toThrow(
      /online price/,
    );
  });
});
