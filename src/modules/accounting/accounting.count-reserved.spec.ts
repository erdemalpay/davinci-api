jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { OrderStatus } from '../order/order.dto';
import { HepsiburadaService } from '../hepsiburada/hepsiburada.service';
import { ShopifyService } from '../shopify/shopify.service';
import { TrendyolService } from '../trendyol/trendyol.service';
import { AccountingService } from './accounting.service';
import { toReservedStockEntries } from 'src/lib/mappers';

const DEPOT = 6;
const BAHCELI = 1;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null));

const valueMatches = (actual: any, expected: any) => {
  if (expected && typeof expected === 'object' && '$ne' in expected) {
    return actual !== expected.$ne;
  }
  if (expected === null) return actual === null || actual === undefined;
  return actual === expected;
};

const elementMatches = (element: any, condition: any) =>
  Object.entries(condition).every(([key, expected]) =>
    valueMatches(element[key], expected),
  );

/** Sayım koleksiyonunun kodda kullanılan sorgularını taklit eden bellek içi model. */
const createCountModel = (initialCounts: any[]) => {
  const counts = new Map<string, any>(
    initialCounts.map((count) => [String(count._id), clone(count)]),
  );

  const findPosition = (count: any, filter: any) => {
    const products: any[] = count.products ?? [];
    if (filter.products?.$elemMatch) {
      return products.findIndex((element) =>
        elementMatches(element, filter.products.$elemMatch),
      );
    }
    const productFilter = filter['products.product'];
    if (typeof productFilter === 'string') {
      return products.findIndex((element) => element.product === productFilter);
    }
    return -1;
  };

  const matches = (count: any, filter: any) => {
    if (!count) return false;
    const productFilter = filter['products.product'];
    if (productFilter && typeof productFilter === 'object') {
      return !(count.products ?? []).some(
        (element: any) => element.product === productFilter.$ne,
      );
    }
    if (productFilter || filter.products) {
      return findPosition(count, filter) !== -1;
    }
    return true;
  };

  const query = (id: any) => {
    const resolve = async () => clone(counts.get(String(id)));
    const chain: any = {
      select: () => chain,
      lean: resolve,
      then: (onFulfilled: any, onRejected: any) =>
        resolve().then(onFulfilled, onRejected),
    };
    return chain;
  };

  return {
    counts,
    findById: query,
    findByIdAndUpdate: async (id: any, updates: any) => {
      const count = counts.get(String(id));
      Object.assign(count, clone(updates));
      return clone(count);
    },
    updateOne: async (filter: any, update: any) => {
      const count = counts.get(String(filter._id));
      if (!matches(count, filter)) return { matchedCount: 0, modifiedCount: 0 };
      const position = findPosition(count, filter);
      const apply = (
        path: string,
        apply: (target: any, key: string) => void,
      ) => {
        if (path.startsWith('products.$.')) {
          apply(count.products[position], path.slice('products.$.'.length));
        } else {
          apply(count, path);
        }
      };
      for (const [path, value] of Object.entries(update.$set ?? {})) {
        apply(path, (target, key) => (target[key] = clone(value)));
      }
      for (const path of Object.keys(update.$unset ?? {})) {
        apply(path, (target, key) => delete target[key]);
      }
      if (update.$push?.products) {
        count.products.push(clone(update.$push.products));
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
};

type Harness = {
  service: any;
  countModel: ReturnType<typeof createCountModel>;
  stocks: Record<string, number>;
  stockMovements: { product: string; createdAt: Date }[];
  createdStocks: any[];
  channelCalls: number;
  reserved: {
    shopify: () => Promise<any[]>;
    trendyol: () => Promise<any[]>;
    hepsiburada: () => Promise<any[]>;
  };
  flush: () => Promise<void>;
};

const buildHarness = (counts: any[]): Harness => {
  const harness: Partial<Harness> = {
    stocks: {},
    stockMovements: [],
    createdStocks: [],
    channelCalls: 0,
    reserved: {
      shopify: async () => [],
      trendyol: async () => [],
      hepsiburada: async () => [],
    },
  };
  const countModel = createCountModel(counts);
  const pending: Promise<any>[] = [];

  const service = new (AccountingService as any)();
  service.countModel = countModel;
  service.stockModel = {
    findOne: ({ product }: any) => ({
      lean: async () =>
        product in harness.stocks
          ? { product, quantity: harness.stocks[product] }
          : null,
    }),
  };
  service.productStockHistoryModel = {
    exists: async ({ product, createdAt }: any) =>
      harness.stockMovements.some(
        (movement) =>
          movement.product === product && movement.createdAt >= createdAt.$gte,
      ),
  };
  service.productModel = {
    findOne: async ({ _id }: any) => ({ _id, deleted: false }),
  };
  // Ayrılmış adet önbelleği Redis'te tutuluyor; testte bellek içi karşılığı.
  const redisStore: Record<string, any> = {};
  service.redisService = {
    get: async (key: string) => (key in redisStore ? redisStore[key] : null),
    set: async (key: string, value: any) => {
      redisStore[key] = JSON.parse(JSON.stringify(value));
      return 'OK';
    },
    reset: async (...keys: string[]) => {
      keys.forEach((key) => delete redisStore[key]);
      return keys.length;
    },
  };
  service.websocketGateway = { emitCountChanged: () => undefined };
  service.notificationService = { findAllEventNotifications: async () => [] };
  service.activityService = { addActivity: async () => undefined };
  service.createStock = async (_user: any, dto: any) => {
    harness.createdStocks.push(dto);
  };
  const channel = (name: keyof Harness['reserved']) => ({
    getReservedStocks: () => {
      harness.channelCalls++;
      const result = harness.reserved[name]();
      pending.push(result.catch(() => undefined));
      return result;
    },
  });
  service.shopifyService = channel('shopify');
  service.trendyolService = channel('trendyol');
  service.hepsiburadaService = channel('hepsiburada');

  const originalSave = service.saveCountReservedSnapshot.bind(service);
  service.saveCountReservedSnapshot = (...args: any[]) => {
    const result = originalSave(...args);
    pending.push(result);
    return result;
  };

  harness.service = service;
  harness.countModel = countModel;
  harness.flush = async () => {
    while (pending.length) {
      await pending.shift();
    }
  };
  return harness as Harness;
};

const user = { _id: 'hilmi' } as any;
const product = (id: string, fields: any = {}) => ({ product: id, ...fields });
const countProductOf = (harness: Harness, countId: string, id: string) =>
  harness.countModel.counts
    .get(countId)
    .products.find((item: any) => item.product === id);

describe('toReservedStockEntries', () => {
  it('stoğun düştüğü tarif ürünlerini adetle çarpar, stok düşmeyenleri atlar', () => {
    const item = {
      itemProduction: [
        { product: 'catan', quantity: 1, isDecrementStock: true },
        { product: 'kutu', quantity: 2, isDecrementStock: true },
        { product: 'kart', quantity: 5, isDecrementStock: false },
      ],
    };
    expect(
      toReservedStockEntries(item, 3, {
        channel: 'shopify',
        orderNumber: '#1',
      }),
    ).toEqual([
      { channel: 'shopify', orderNumber: '#1', product: 'catan', quantity: 3 },
      { channel: 'shopify', orderNumber: '#1', product: 'kutu', quantity: 6 },
    ]);
  });

  it('tarifi olmayan menü ürününde boş döner', () => {
    expect(
      toReservedStockEntries(undefined, 2, {
        channel: 'trendyol',
        orderNumber: '1',
      }),
    ).toEqual([]);
  });
});

describe('sayı girişi – ayrılmış kaydı', () => {
  const depotCount = () => ({
    _id: 'sayim',
    location: DEPOT,
    isCompleted: false,
    products: [],
  });

  it('Neorama Depo sayımında sayı girilince o anki stok ve ayrılmış adet kaydedilir', async () => {
    const harness = buildHarness([depotCount()]);
    harness.stocks.catan = 5;
    harness.reserved.shopify = async () => [
      {
        product: 'catan',
        channel: 'shopify',
        orderNumber: '#6170',
        quantity: 1,
      },
    ];
    harness.reserved.trendyol = async () => [
      {
        product: 'catan',
        channel: 'trendyol',
        orderNumber: '4166',
        quantity: 1,
      },
    ];

    await harness.service.updateCountProduct('sayim', {
      product: 'catan',
      countQuantity: 7,
      stockQuantity: 99,
    });
    await harness.flush();

    expect(countProductOf(harness, 'sayim', 'catan')).toEqual({
      product: 'catan',
      countQuantity: 7,
      stockQuantity: 5,
      reservedQuantity: 2,
      reservedDetails: [
        { channel: 'shopify', orderNumber: '#6170', quantity: 1 },
        { channel: 'trendyol', orderNumber: '4166', quantity: 1 },
      ],
    });
  });

  it('diğer lokasyonlarda dış servislere gidilmez ve kayıt eskisi gibi yazılır', async () => {
    const harness = buildHarness([
      { _id: 'bahceli', location: BAHCELI, isCompleted: false, products: [] },
    ]);

    await harness.service.updateCountProduct('bahceli', {
      product: 'catan',
      countQuantity: 4,
      stockQuantity: 3,
    });
    await harness.flush();

    expect(harness.channelCalls).toBe(0);
    expect(countProductOf(harness, 'bahceli', 'catan')).toEqual({
      product: 'catan',
      countQuantity: 4,
      stockQuantity: 3,
    });
  });

  it('ayrılmış adet çekildikten sonra ürünün stoğu oynadıysa yeniden çekilir', async () => {
    const harness = buildHarness([depotCount()]);
    harness.stocks.catan = 5;
    let shopifyCalls = 0;
    harness.reserved.shopify = async () => {
      shopifyCalls++;
      if (shopifyCalls === 1) {
        // Tarama sürerken yeni satış: stok 4'e düştü, ilk tarama bunu görmedi.
        harness.stocks.catan = 4;
        harness.stockMovements.push({
          product: 'catan',
          createdAt: new Date(),
        });
        return [];
      }
      harness.stockMovements.length = 0;
      return [
        {
          product: 'catan',
          channel: 'shopify',
          orderNumber: '#1',
          quantity: 1,
        },
      ];
    };

    await harness.service.updateCountProduct('sayim', {
      product: 'catan',
      countQuantity: 5,
      stockQuantity: 5,
    });
    await harness.flush();

    expect(shopifyCalls).toBe(2);
    expect(countProductOf(harness, 'sayim', 'catan')).toMatchObject({
      stockQuantity: 4,
      reservedQuantity: 1,
    });
  });

  it('tarama sırasında bir sipariş gönderilirse kayıt yeniden alınır', async () => {
    const harness = buildHarness([depotCount()]);
    harness.stocks.catan = 5;
    let shopifyCalls = 0;
    harness.reserved.shopify = async () => {
      shopifyCalls++;
      if (shopifyCalls === 1) {
        harness.service.invalidateReservedStocks();
        return [
          {
            product: 'catan',
            channel: 'shopify',
            orderNumber: '#1',
            quantity: 2,
          },
        ];
      }
      return [];
    };

    await harness.service.updateCountProduct('sayim', {
      product: 'catan',
      countQuantity: 5,
      stockQuantity: 5,
    });
    await harness.flush();

    expect(shopifyCalls).toBe(2);
    expect(countProductOf(harness, 'sayim', 'catan')).toMatchObject({
      reservedQuantity: 0,
    });
  });

  it('bir kanal hata verirse kayıt alınmaz, sayı yine de kaydedilir', async () => {
    const harness = buildHarness([depotCount()]);
    harness.stocks.catan = 5;
    harness.reserved.trendyol = async () => {
      throw new Error('Trendyol kapalı');
    };
    harness.service.logger = { error: () => undefined };

    await harness.service.updateCountProduct('sayim', {
      product: 'catan',
      countQuantity: 7,
      stockQuantity: 5,
    });
    await harness.flush();

    expect(countProductOf(harness, 'sayim', 'catan')).toEqual({
      product: 'catan',
      countQuantity: 7,
      stockQuantity: 5,
    });
  });

  it('sayı yeniden girilince eski kayıt silinir, gecikmiş eski kayıt yenisinin üzerine yazılmaz', async () => {
    const harness = buildHarness([depotCount()]);
    harness.stocks.catan = 5;
    let releaseFirst: () => void;
    let shopifyCalls = 0;
    harness.reserved.shopify = async () => {
      shopifyCalls++;
      if (shopifyCalls === 1) {
        await new Promise<void>((resolve) => (releaseFirst = resolve));
        return [
          {
            product: 'catan',
            channel: 'shopify',
            orderNumber: '#eski',
            quantity: 9,
          },
        ];
      }
      return [
        {
          product: 'catan',
          channel: 'shopify',
          orderNumber: '#yeni',
          quantity: 1,
        },
      ];
    };

    await harness.service.updateCountProduct('sayim', {
      product: 'catan',
      countQuantity: 6,
      stockQuantity: 5,
    });
    // İlk tarama bitmeden önbellek geçersiz olsun ki ikinci giriş yeni tarama yapsın.
    harness.service.invalidateReservedStocks();
    await harness.service.updateCountProduct('sayim', {
      product: 'catan',
      countQuantity: 7,
      stockQuantity: 5,
    });
    releaseFirst();
    await harness.flush();

    expect(countProductOf(harness, 'sayim', 'catan')).toMatchObject({
      countQuantity: 7,
      reservedQuantity: 1,
      reservedDetails: [
        { channel: 'shopify', orderNumber: '#yeni', quantity: 1 },
      ],
    });
  });

  it('önbellek süresi içinde başka ürün girilince dış servislere tekrar gidilmez', async () => {
    const harness = buildHarness([depotCount()]);
    harness.stocks.catan = 5;
    harness.stocks.azul = 3;

    await harness.service.updateCountProduct('sayim', {
      product: 'catan',
      countQuantity: 5,
      stockQuantity: 5,
    });
    await harness.flush();
    await harness.service.updateCountProduct('sayim', {
      product: 'azul',
      countQuantity: 3,
      stockQuantity: 3,
    });
    await harness.flush();

    expect(harness.channelCalls).toBe(3);
    expect(countProductOf(harness, 'sayim', 'azul')).toMatchObject({
      reservedQuantity: 0,
    });
  });
});

describe('eşitleme', () => {
  const equalizedCount = (fields: any, location = DEPOT) => ({
    _id: 'sayim',
    location,
    isCompleted: true,
    products: [product('catan', fields)],
  });

  const equalize = (harness: Harness, quantity: number, location = DEPOT) =>
    harness.service.updateStockForStockCount(
      user,
      'catan',
      location,
      quantity,
      'sayim',
    );

  it('ayrılmış siparişler rafta olduğu için sahte fark stoğu değiştirmez', async () => {
    const harness = buildHarness([
      equalizedCount({
        countQuantity: 7,
        stockQuantity: 5,
        reservedQuantity: 2,
      }),
    ]);
    harness.stocks.catan = 5;

    await equalize(harness, 7);

    expect(harness.createdStocks).toEqual([
      expect.objectContaining({
        product: 'catan',
        location: DEPOT,
        quantity: 0,
      }),
    ]);
    expect(countProductOf(harness, 'sayim', 'catan')).toMatchObject({
      isStockEqualized: true,
      appliedStockChange: 0,
    });
  });

  it('sayımdan sonra gelen satış eşitlemede kaybolmaz', async () => {
    const harness = buildHarness([
      equalizedCount({
        countQuantity: 7,
        stockQuantity: 5,
        reservedQuantity: 2,
      }),
    ]);
    harness.stocks.catan = 4;

    await equalize(harness, 7);

    expect(harness.createdStocks[0].quantity).toBe(0);
  });

  it('gerçek eksik stoktan düşülür', async () => {
    const harness = buildHarness([
      equalizedCount({
        countQuantity: 3,
        stockQuantity: 3,
        reservedQuantity: 1,
      }),
    ]);

    await equalize(harness, 3);

    expect(harness.createdStocks[0].quantity).toBe(-1);
  });

  it('aynı anda iki kez basılırsa düzeltme bir kez uygulanır', async () => {
    const harness = buildHarness([
      equalizedCount({
        countQuantity: 3,
        stockQuantity: 3,
        reservedQuantity: 1,
      }),
    ]);

    await Promise.all([equalize(harness, 3), equalize(harness, 3)]);

    expect(harness.createdStocks).toHaveLength(1);
  });

  it('sayım yeniden açılıp tekrar eşitlenirse düzeltme ikinci kez uygulanmaz', async () => {
    const harness = buildHarness([
      equalizedCount({
        countQuantity: 3,
        stockQuantity: 3,
        reservedQuantity: 1,
      }),
    ]);
    await equalize(harness, 3);
    // Arşivdeki "aktif/pasif" düğmesi tüm ürünlerin eşitlendi işaretini kaldırıyor.
    countProductOf(harness, 'sayim', 'catan').isStockEqualized = false;

    await equalize(harness, 3);

    expect(harness.createdStocks.map((stock) => stock.quantity)).toEqual([
      -1, 0,
    ]);
  });

  it('ayrılmış kaydı olmayan sayımda eski yöntem aynen çalışır', async () => {
    const harness = buildHarness([
      equalizedCount({ countQuantity: 7, stockQuantity: 5 }),
    ]);
    harness.stocks.catan = 4;
    harness.service.stockModel.findOne = async ({ product: id }: any) => ({
      product: id,
      quantity: harness.stocks[id],
    });

    await equalize(harness, 7);

    expect(harness.createdStocks[0].quantity).toBe(3);
  });

  it('diğer lokasyonlarda eski yöntem aynen çalışır', async () => {
    const harness = buildHarness([
      equalizedCount(
        { countQuantity: 7, stockQuantity: 5, reservedQuantity: 2 },
        BAHCELI,
      ),
    ]);
    harness.service.stockModel.findOne = async () => ({ quantity: 4 });

    await equalize(harness, 7, BAHCELI);

    expect(harness.createdStocks[0]).toMatchObject({
      location: BAHCELI,
      quantity: 3,
    });
  });
});

describe('sayım tamamlama – ürün listesinin bütün olarak yazılması', () => {
  const savedCount = (location = DEPOT) => ({
    _id: 'sayim',
    location,
    isCompleted: false,
    products: [
      product('catan', {
        countQuantity: 7,
        stockQuantity: 5,
        reservedQuantity: 2,
        reservedDetails: [
          { channel: 'shopify', orderNumber: '#1', quantity: 2 },
        ],
      }),
    ],
  });

  it('ekrandaki eski liste kaydı silmez', async () => {
    const harness = buildHarness([savedCount()]);

    await harness.service.updateCount(user, 'sayim', {
      isCompleted: true,
      products: [{ product: 'catan', countQuantity: 7, stockQuantity: 4 }],
    });

    expect(countProductOf(harness, 'sayim', 'catan')).toMatchObject({
      stockQuantity: 5,
      reservedQuantity: 2,
    });
  });

  it('ekrandaki sayı farklıysa eski kayıt taşınmaz, eşitleme eski yönteme düşer', async () => {
    const harness = buildHarness([savedCount()]);

    await harness.service.updateCount(user, 'sayim', {
      isCompleted: true,
      products: [
        {
          product: 'catan',
          countQuantity: 8,
          stockQuantity: 4,
          reservedQuantity: 2,
        },
      ],
    });

    const saved = countProductOf(harness, 'sayim', 'catan');
    expect(saved.countQuantity).toBe(8);
    expect(saved.reservedQuantity).toBeUndefined();
  });

  it('hiç sayılmamış ürün için tamamlanırken kayıt alınır', async () => {
    const harness = buildHarness([savedCount()]);
    harness.stocks.azul = 2;
    harness.reserved.hepsiburada = async () => [
      {
        product: 'azul',
        channel: 'hepsiburada',
        orderNumber: '46',
        quantity: 1,
      },
    ];

    await harness.service.updateCount(user, 'sayim', {
      isCompleted: true,
      products: [
        { product: 'catan', countQuantity: 7, stockQuantity: 5 },
        { product: 'azul', countQuantity: 0, stockQuantity: 2 },
      ],
    });

    expect(countProductOf(harness, 'sayim', 'azul')).toMatchObject({
      stockQuantity: 2,
      reservedQuantity: 1,
    });
  });

  it('diğer lokasyonlarda liste olduğu gibi yazılır', async () => {
    const harness = buildHarness([savedCount(BAHCELI)]);
    const products = [{ product: 'catan', countQuantity: 7, stockQuantity: 4 }];

    await harness.service.updateCount(user, 'sayim', {
      isCompleted: true,
      products,
    });

    expect(harness.channelCalls).toBe(0);
    expect(harness.countModel.counts.get('sayim').products).toEqual(products);
  });
});

describe('Shopify ayrılmış kalemleri', () => {
  const catan = {
    isPreOrder: false,
    itemProduction: [{ product: 'catan', quantity: 1, isDecrementStock: true }],
  };
  const onSiparis = {
    isPreOrder: true,
    itemProduction: [
      { product: 'hot_streak', quantity: 1, isDecrementStock: true },
    ],
  };

  const buildShopify = (pages: any[], panelOrders: any[]) => {
    const service = Object.create(ShopifyService.prototype);
    let page = 0;
    service.executeGraphQLRequest = async () => ({
      data: { orders: pages[page++] },
    });
    service.getGraphQLClient = async () => ({});
    service.handleGraphQLErrors = () => undefined;
    service.orderService = {
      findByShopifyOrderLineItemIds: async (ids: string[]) =>
        panelOrders.filter((order) =>
          ids.includes(order.shopifyOrderLineItemId),
        ),
    };
    return service;
  };

  const line = (id: string, unfulfilledQuantity: number) => ({
    id: `gid://shopify/LineItem/${id}`,
    unfulfilledQuantity,
  });
  const shopifyOrder = (name: string, lines: any[], fields: any = {}) => ({
    name,
    cancelledAt: null,
    lineItems: {
      pageInfo: { hasNextPage: false },
      edges: lines.map((node) => ({ node })),
    },
    ...fields,
  });
  const panelOrder = (lineItemId: string, fields: any = {}) => ({
    shopifyOrderLineItemId: lineItemId,
    stockLocation: DEPOT,
    status: OrderStatus.AUTOSERVED,
    quantity: 5,
    item: catan,
    ...fields,
  });

  it('yalnızca rafta bekleyen kalemleri sayar', async () => {
    const service = buildShopify(
      [
        {
          pageInfo: { hasNextPage: true, endCursor: 'c1' },
          edges: [
            shopifyOrder('#1', [line('1', 2), line('2', 1), line('3', 0)]),
            shopifyOrder('#2', [line('4', 1)], { cancelledAt: '2026-09-01' }),
          ].map((node) => ({ node })),
        },
        {
          pageInfo: { hasNextPage: false, endCursor: null },
          edges: [
            shopifyOrder('#3', [
              line('5', 1),
              line('6', 1),
              line('7', 1),
              line('8', 1),
              line('9', 1),
              line('10', 1),
              line('11', 3),
            ]),
          ].map((node) => ({ node })),
        },
      ],
      [
        panelOrder('1'),
        panelOrder('2', { item: onSiparis }),
        panelOrder('3'),
        panelOrder('4'),
        panelOrder('5', {
          isShopifyPickUp: true,
          isShopifyPickUpOrderBrought: true,
        }),
        panelOrder('6', {
          isShopifyPickUp: true,
          isShopifyCustomerPicked: true,
        }),
        panelOrder('7', { isShopifyPickUp: true }),
        panelOrder('8', { status: OrderStatus.CANCELLED }),
        panelOrder('9', { stockLocation: BAHCELI }),
        panelOrder('11', { quantity: 1 }),
      ],
    );

    const entries = await service.getReservedStocks(DEPOT);

    expect(entries).toEqual([
      { channel: 'shopify', orderNumber: '#1', product: 'catan', quantity: 2 },
      { channel: 'shopify', orderNumber: '#3', product: 'catan', quantity: 1 },
      { channel: 'shopify', orderNumber: '#3', product: 'catan', quantity: 1 },
    ]);
  });

  it('kalemlerin tamamı okunamayan siparişte hata verir, yanlış adet üretmez', async () => {
    const service = buildShopify(
      [
        {
          pageInfo: { hasNextPage: false, endCursor: null },
          edges: [
            {
              node: {
                ...shopifyOrder('#1', [line('1', 1)]),
                lineItems: {
                  pageInfo: { hasNextPage: true },
                  edges: [{ node: line('1', 1) }],
                },
              },
            },
          ],
        },
      ],
      [panelOrder('1')],
    );

    await expect(service.getReservedStocks(DEPOT)).rejects.toThrow();
  });
});

describe('Trendyol ayrılmış paketleri', () => {
  const buildOrder = (overrides: any) => ({
    stockLocation: DEPOT,
    status: OrderStatus.AUTOSERVED,
    quantity: 1,
    item: {
      itemProduction: [
        { product: 'codenames', quantity: 1, isDecrementStock: true },
      ],
    },
    ...overrides,
  });

  it('statüleri tek istekte sorar, sayfaları gezer ve iptalleri saymaz', async () => {
    const service = Object.create(TrendyolService.prototype);
    const asked: string[] = [];
    service.getAllOrders = async ({ status, page }: any) => {
      asked.push(`${status}:${page}`);
      return {
        totalPages: 2,
        content:
          page === 0
            ? [{ id: 4166029526, orderNumber: '11613677568' }]
            : [{ id: 4166029527, orderNumber: '11613677569' }],
      };
    };
    const lookedUpIds: string[][] = [];
    service.orderService = {
      findByTrendyolShipmentPackageIds: async (ids: string[]) => {
        lookedUpIds.push(ids);
        return [
          buildOrder({ trendyolShipmentPackageId: '4166029526' }),
          buildOrder({
            trendyolShipmentPackageId: '4166029526',
            status: OrderStatus.CANCELLED,
          }),
          buildOrder({ trendyolShipmentPackageId: '4166029527', quantity: 3 }),
        ];
      },
    };

    const entries = await service.getReservedStocks(DEPOT);

    // Üç statü ayrı ayrı değil, tek istekte birleşim olarak sorulur.
    expect(asked).toEqual([
      'Created,Picking,Invoiced:0',
      'Created,Picking,Invoiced:1',
    ]);
    // Paket başına sorgu atılmaz; tüm paketler tek sorguda eşleştirilir.
    expect(lookedUpIds).toEqual([['4166029526', '4166029527']]);
    expect(entries).toEqual([
      {
        channel: 'trendyol',
        orderNumber: '11613677568',
        product: 'codenames',
        quantity: 1,
      },
      {
        channel: 'trendyol',
        orderNumber: '11613677569',
        product: 'codenames',
        quantity: 3,
      },
    ]);
  });

  it('açık paket yoksa veritabanına hiç gitmez', async () => {
    const service = Object.create(TrendyolService.prototype);
    service.getAllOrders = async () => ({ totalPages: 0, content: [] });
    const findByTrendyolShipmentPackageIds = jest.fn();
    service.orderService = { findByTrendyolShipmentPackageIds };

    expect(await service.getReservedStocks(DEPOT)).toEqual([]);
    expect(findByTrendyolShipmentPackageIds).not.toHaveBeenCalled();
  });

  it('başka depodaki paketleri saymaz', async () => {
    const service = Object.create(TrendyolService.prototype);
    service.getAllOrders = async ({ page }: any) => ({
      totalPages: 1,
      content: page === 0 ? [{ id: 1, orderNumber: 'A' }] : [],
    });
    service.orderService = {
      findByTrendyolShipmentPackageIds: async () => [
        buildOrder({ trendyolShipmentPackageId: '1', stockLocation: 2 }),
      ],
    };

    expect(await service.getReservedStocks(DEPOT)).toEqual([]);
  });
});

describe('Hepsiburada paket bildirimleri', () => {
  const buildHepsiburada = () => {
    const service = Object.create(HepsiburadaService.prototype);
    const updates: any[] = [];
    const webhookLogs: any[] = [];
    let invalidations = 0;
    service.orderModel = {
      updateMany: async (filter: any, update: any) => {
        updates.push({ filter, update });
      },
    };
    service.accountingService = {
      invalidateReservedStocks: () => invalidations++,
    };
    // Paket bildirimleri de diğer webhook'lar gibi kaydediliyor.
    service.webhookLogService = {
      logWebhookRequest: async (source: any, endpoint: any, requestBody: any) => {
        const log = { _id: webhookLogs.length + 1, source, endpoint, requestBody };
        webhookLogs.push(log);
        return log;
      },
      updateWebhookResponse: async (logId: number, responseBody: any, _code: number, status: any) => {
        Object.assign(webhookLogs[logId - 1], { responseBody, status });
      },
    };
    return {
      service,
      updates,
      webhookLogs,
      invalidations: () => invalidations,
    };
  };

  it('paket oluşturulunca kalemlere paket numarası yazılır', async () => {
    const { service, updates, invalidations } = buildHepsiburada();

    await service.markPackageCreated({
      packageNumber: 5517292802,
      items: [{ lineItemId: 'a' }, { lineItemId: 'b' }, {}],
    });

    expect(updates).toEqual([
      {
        filter: { hepsiburadaLineItemId: { $in: ['a', 'b'] } },
        update: { $set: { hepsiburadaPackageNumber: '5517292802' } },
      },
    ]);
    expect(invalidations()).toBe(0);
  });

  it('eksik bildirimde hiçbir sipariş değiştirilmez', async () => {
    const { service, updates } = buildHepsiburada();

    await service.markPackageCreated({ items: [{ lineItemId: 'a' }] });
    await service.markPackageCreated({ packageNumber: '1', items: [] });
    await service.markPackageShipped('');
    await service.markPackageUnpacked(undefined);

    expect(updates).toEqual([]);
  });

  it('kargoya verilince paketteki siparişler gönderildi olur ve sayım verisi yenilenir', async () => {
    const { service, updates, invalidations } = buildHepsiburada();

    await service.markPackageShipped('5517292802');

    expect(updates).toEqual([
      {
        filter: { hepsiburadaPackageNumber: '5517292802' },
        update: { $set: { isShipped: true } },
      },
    ]);
    expect(invalidations()).toBe(1);
  });

  it('paket bozulunca paket numarası kaldırılır, gönderildi bilgisi değişmez', async () => {
    const { service, updates } = buildHepsiburada();

    await service.markPackageUnpacked('5517292802');

    expect(updates).toEqual([
      {
        filter: { hepsiburadaPackageNumber: '5517292802' },
        update: { $unset: { hepsiburadaPackageNumber: '' } },
      },
    ]);
  });

  it('hiç paket bildirimi gelmemişse ayrılmış hesaplanmaz, veritabanına gitmez', async () => {
    const service = Object.create(HepsiburadaService.prototype);
    service.webhookLogService = { findEarliest: async () => null };
    const find = jest.fn();
    service.orderModel = { find };

    expect(await service.getReservedStocks(DEPOT)).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it('takip başlangıcını ilk paket bildiriminden okur ve bir kez sorar', async () => {
    const service = Object.create(HepsiburadaService.prototype);
    const findEarliest = jest.fn(async () => ({
      createdAt: new Date('2026-09-18T15:00:00+03:00'),
    }));
    service.webhookLogService = { findEarliest };

    expect(await service.getShipmentTrackingStart()).toEqual(
      new Date('2026-09-18T15:00:00+03:00'),
    );
    await service.getShipmentTrackingStart();
    expect(findEarliest).toHaveBeenCalledTimes(1);
  });

  it('ayrılmış siparişleri depo, iptal, gönderim ve takip başlangıcına göre süzer', async () => {
    const service = Object.create(HepsiburadaService.prototype);
    const trackingStart = new Date('2026-09-18T15:00:00+03:00');
    service.webhookLogService = {
      findEarliest: async () => ({ createdAt: trackingStart }),
    };
    const item = {
      itemProduction: [
        { product: 'exploding_kittens', quantity: 1, isDecrementStock: true },
      ],
    };
    let capturedFilter: any;
    service.orderModel = {
      find: (filter: any) => {
        capturedFilter = filter;
        return {
          populate: () => ({
            lean: async () => [
              { hepsiburadaOrderNumber: '1', stockLocation: DEPOT, status: OrderStatus.AUTOSERVED, quantity: 2, item },
              { hepsiburadaOrderNumber: '2', stockLocation: DEPOT, status: OrderStatus.CANCELLED, quantity: 1, item },
              { hepsiburadaOrderNumber: '3', stockLocation: 2, status: OrderStatus.AUTOSERVED, quantity: 1, item },
            ],
          }),
        };
      },
    };

    const entries = await service.getReservedStocks(DEPOT);

    // Kargo ve takip başlangıcı sorguda; depo ve iptal kontrolü ortak kuralda.
    expect(capturedFilter).toEqual({
      hepsiburadaLineItemId: { $type: 'string' },
      isShipped: { $ne: true },
      createdAt: { $gte: trackingStart },
    });
    expect(entries).toEqual([
      {
        channel: 'hepsiburada',
        orderNumber: '1',
        product: 'exploding_kittens',
        quantity: 2,
      },
    ]);
  });
});
