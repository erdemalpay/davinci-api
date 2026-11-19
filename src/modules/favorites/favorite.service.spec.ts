import { HttpException, Logger } from '@nestjs/common';
import {
  FavoriteService,
  MAX_FAVORITES_PER_CUSTOMER,
  numericShopifyId,
} from './favorite.service';

jest.mock('../shopify/shopify.service', () => ({
  ShopifyService: class ShopifyService {},
}));
jest.mock('../websocket/websocket.gateway', () => ({
  AppWebSocketGateway: class AppWebSocketGateway {},
}));

type Row = {
  _id: number;
  shopifyCustomerId: string;
  shopifyProductId: string;
  handle?: string;
  createdAt: Date;
};

const matches = (row: Row, filter: Record<string, any>) =>
  Object.entries(filter).every(([key, value]) =>
    value && typeof value === 'object' && '$in' in value
      ? value.$in.includes(row[key])
      : row[key] === value,
  );

// Just enough of a Mongoose model, backed by an array, to run the service.
const makeFavoriteModel = (initial: Partial<Row>[] = []) => {
  let nextId = 1;
  const rows: Row[] = initial.map((r) => ({
    _id: nextId++,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    ...r,
  })) as Row[];

  const query = (result: () => Row[]) => {
    const q: any = {
      sort: () => q,
      select: () => q,
      lean: async () => result().map((r) => ({ ...r })),
    };
    return q;
  };

  const model: any = {
    rows,
    find: jest.fn((filter = {}) =>
      query(() =>
        rows
          .filter((r) => matches(r, filter))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ),
    ),
    countDocuments: jest.fn(
      async (filter = {}) => rows.filter((r) => matches(r, filter)).length,
    ),
    exists: jest.fn(async (filter) =>
      rows.some((r) => matches(r, filter)) ? { _id: 1 } : null,
    ),
    findOne: jest.fn(async (filter) => {
      const row = rows.find((r) => matches(r, filter));
      return row
        ? Object.assign(row, { save: jest.fn(async () => row) })
        : null;
    }),
    create: jest.fn(async (doc) => {
      if (
        rows.some(
          (r) =>
            r.shopifyCustomerId === doc.shopifyCustomerId &&
            r.shopifyProductId === doc.shopifyProductId,
        )
      ) {
        throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      }
      const row = { _id: nextId++, ...doc };
      rows.push(row);
      return row;
    }),
    deleteOne: jest.fn(async (filter) => {
      const index = rows.findIndex((r) => matches(r, filter));
      if (index >= 0) rows.splice(index, 1);
    }),
    bulkWrite: jest.fn(async (ops: any[]) => {
      for (const op of ops) {
        if (op.deleteOne) {
          const index = rows.findIndex(
            (r) => r._id === op.deleteOne.filter._id,
          );
          if (index >= 0) rows.splice(index, 1);
        } else if (op.updateOne) {
          const row = rows.find((r) => r._id === op.updateOne.filter._id);
          if (row) Object.assign(row, op.updateOne.update.$set);
        }
      }
    }),
    aggregate: jest.fn(),
    distinct: jest.fn(),
  };
  return model;
};

const product = (id: string, handle: string) => ({
  id: `gid://shopify/Product/${id}`,
  handle,
  title: `Game ${id}`,
  status: 'ACTIVE',
  totalInventory: 3,
  onlineStoreUrl: `https://kutuoyunual.com/products/${handle}`,
  featuredMedia: { preview: { image: { url: `https://cdn/${id}.png` } } },
  priceRangeV2: { minVariantPrice: { amount: '100.0' } },
  compareAtPriceRange: { minVariantCompareAtPrice: { amount: '120.0' } },
});

const setup = (initial: Partial<Row>[] = [], nodes: any[] = []) => {
  const model = makeFavoriteModel(initial);
  const shopifyService: any = {
    adminGraphQL: jest.fn(async () => ({ nodes })),
  };
  const websocketGateway: any = { emitFavoritesChanged: jest.fn() };
  const service = new FavoriteService(model, shopifyService, websocketGateway);
  return { service, model, shopifyService, websocketGateway };
};

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});

describe('numericShopifyId', () => {
  it('accepts numbers and gids, rejects anything else', () => {
    expect(numericShopifyId('123')).toBe('123');
    expect(numericShopifyId('gid://shopify/Product/123')).toBe('123');
    expect(numericShopifyId(123)).toBe('123');
    expect(numericShopifyId('abc')).toBeNull();
    expect(numericShopifyId('')).toBeNull();
    expect(numericShopifyId(undefined)).toBeNull();
  });
});

describe('FavoriteService storefront', () => {
  it('adds a favorite once, even when added twice', async () => {
    const { service, model, websocketGateway } = setup();
    await service.add('1', {
      productId: 'gid://shopify/Product/10',
      handle: 'catan',
    });
    const result = await service.add('1', { productId: '10', handle: 'catan' });

    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]).toMatchObject({
      shopifyCustomerId: '1',
      shopifyProductId: '10',
      handle: 'catan',
    });
    expect(result.items).toEqual([
      expect.objectContaining({ productId: '10', handle: 'catan' }),
    ]);
    expect(websocketGateway.emitFavoritesChanged).toHaveBeenCalled();
  });

  it('treats a duplicate-key race as already added', async () => {
    const { service, model } = setup();
    model.findOne.mockResolvedValueOnce(null);
    await service.add('1', { productId: '10' });
    model.findOne.mockResolvedValueOnce(null);
    await expect(service.add('1', { productId: '10' })).resolves.toBeDefined();
    expect(model.rows).toHaveLength(1);
  });

  it('updates a stored handle when the theme sends a new one', async () => {
    const { service, model } = setup([
      { shopifyCustomerId: '1', shopifyProductId: '10', handle: 'old' },
    ]);
    await service.add('1', { productId: '10', handle: 'new-handle' });
    expect(model.rows[0].handle).toBe('new-handle');
  });

  it('ignores a malformed handle', async () => {
    const { service, model } = setup();
    await service.add('1', { productId: '10', handle: '<script>' });
    expect(model.rows[0].handle).toBeUndefined();
  });

  it('rejects an invalid product id', async () => {
    const { service } = setup();
    await expect(
      service.add('1', { productId: 'nope' }),
    ).rejects.toBeInstanceOf(HttpException);
    await expect(service.remove('1', { productId: '' })).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('refuses a new favorite over the limit but allows re-adding an existing one', async () => {
    const initial = Array.from(
      { length: MAX_FAVORITES_PER_CUSTOMER },
      (_, i) => ({
        shopifyCustomerId: '1',
        shopifyProductId: String(i + 1),
      }),
    );
    const { service } = setup(initial);
    await expect(
      service.add('1', { productId: '99999' }),
    ).rejects.toBeInstanceOf(HttpException);
    await expect(service.add('1', { productId: '1' })).resolves.toBeDefined();
  });

  it('removes only that customer’s favorite', async () => {
    const { service, model } = setup([
      { shopifyCustomerId: '1', shopifyProductId: '10' },
      { shopifyCustomerId: '2', shopifyProductId: '10' },
    ]);
    const result = await service.remove('1', { productId: '10' });
    expect(result.items).toEqual([]);
    expect(model.rows).toEqual([
      expect.objectContaining({
        shopifyCustomerId: '2',
        shopifyProductId: '10',
      }),
    ]);
  });

  it('merges guest favorites without touching or duplicating existing ones', async () => {
    const { service, model, websocketGateway } = setup([
      { shopifyCustomerId: '1', shopifyProductId: '10', handle: 'kept' },
    ]);
    const result = await service.merge('1', [
      { productId: '10', handle: 'changed' },
      { productId: '11', handle: 'azul' },
      { productId: 'gid://shopify/Product/11', handle: 'azul' },
      { productId: 'bad' },
    ]);

    expect(model.rows.map((r) => [r.shopifyProductId, r.handle])).toEqual([
      ['10', 'kept'],
      ['11', 'azul'],
    ]);
    expect(result.items).toHaveLength(2);
    expect(websocketGateway.emitFavoritesChanged).toHaveBeenCalledTimes(1);
  });

  it('merges nothing and emits nothing for an empty or missing list', async () => {
    const { service, websocketGateway } = setup();
    await service.merge('1', undefined as any);
    await service.merge('1', []);
    expect(websocketGateway.emitFavoritesChanged).not.toHaveBeenCalled();
  });

  it('caps a merge at the per-customer limit', async () => {
    const initial = Array.from(
      { length: MAX_FAVORITES_PER_CUSTOMER - 1 },
      (_, i) => ({ shopifyCustomerId: '1', shopifyProductId: String(i + 1) }),
    );
    const { service, model } = setup(initial);
    await service.merge('1', [{ productId: '90001' }, { productId: '90002' }]);
    expect(model.rows).toHaveLength(MAX_FAVORITES_PER_CUSTOMER);
  });

  it('does not call Shopify for a plain list, only with refresh', async () => {
    const { service, shopifyService } = setup(
      [{ shopifyCustomerId: '1', shopifyProductId: '10', handle: 'catan' }],
      [product('10', 'catan')],
    );
    await service.getStorefrontList('1');
    expect(shopifyService.adminGraphQL).not.toHaveBeenCalled();
    await service.getStorefrontList('1', true);
    expect(shopifyService.adminGraphQL).toHaveBeenCalledTimes(1);
  });
});

describe('FavoriteService panel', () => {
  it('returns live product data and drops deleted products, syncing handles', async () => {
    const { service, model, websocketGateway } = setup(
      [
        { shopifyCustomerId: '1', shopifyProductId: '10', handle: 'old-catan' },
        { shopifyCustomerId: '1', shopifyProductId: '11', handle: 'gone' },
      ],
      [product('10', 'catan'), null],
    );

    const favorites = await service.getCustomerFavorites('1');

    expect(favorites).toEqual([
      expect.objectContaining({
        productId: '10',
        handle: 'catan',
        title: 'Game 10',
        price: 100,
        compareAtPrice: 120,
        totalInventory: 3,
        imageUrl: 'https://cdn/10.png',
      }),
    ]);
    expect(model.rows).toEqual([
      expect.objectContaining({ shopifyProductId: '10', handle: 'catan' }),
    ]);
    expect(websocketGateway.emitFavoritesChanged).toHaveBeenCalled();
  });

  it('ranks the most favorited products and skips deleted ones', async () => {
    const { service, model } = setup([], [product('10', 'catan')]);
    model.aggregate.mockResolvedValue([
      { _id: '10', count: 5, lastAddedAt: new Date('2026-11-10') },
      { _id: '11', count: 2, lastAddedAt: new Date('2026-11-09') },
    ]);

    const top = await service.getTopProducts({
      limit: 1000,
      after: '2026-11-01',
    });

    expect(top).toEqual([
      expect.objectContaining({ productId: '10', favoriteCount: 5 }),
    ]);
    const pipeline = model.aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.createdAt.$gte).toEqual(new Date('2026-11-01'));
    expect(pipeline[pipeline.length - 1].$limit).toBe(250);
  });

  it('lists the customers who favorited a product', async () => {
    const { service } = setup(
      [
        { shopifyCustomerId: '1', shopifyProductId: '10' },
        { shopifyCustomerId: '2', shopifyProductId: '10' },
      ],
      [
        {
          id: 'gid://shopify/Customer/1',
          firstName: 'Ada',
          lastName: 'Y',
          numberOfOrders: '4',
          defaultEmailAddress: { emailAddress: 'ada@example.com' },
        },
      ],
    );

    const customers = await service.getProductCustomers('10');

    expect(customers).toEqual([
      expect.objectContaining({
        customerId: '1',
        name: 'Ada Y',
        email: 'ada@example.com',
        numberOfOrders: 4,
      }),
      expect.objectContaining({ customerId: '2', name: null }),
    ]);
  });

  it('counts favorites per customer and ignores bad ids', async () => {
    const { service, model } = setup();
    model.aggregate.mockResolvedValue([{ _id: '1', count: 3 }]);

    expect(await service.getCountsByCustomer(['1', 'x', '1'])).toEqual({
      '1': 3,
    });
    expect(model.aggregate.mock.calls[0][0][0].$match).toEqual({
      shopifyCustomerId: { $in: ['1'] },
    });
    expect(await service.getCountsByCustomer([])).toEqual({});
  });

  it('summarises totals', async () => {
    const { service, model } = setup([
      { shopifyCustomerId: '1', shopifyProductId: '10' },
    ]);
    model.distinct
      .mockResolvedValueOnce(['1', '2'])
      .mockResolvedValueOnce(['10', '11', '12']);
    model.countDocuments.mockResolvedValueOnce(7).mockResolvedValueOnce(4);

    expect(await service.getSummary()).toEqual({
      totalFavorites: 7,
      customerCount: 2,
      productCount: 3,
      addedLast30Days: 4,
    });
  });
});
