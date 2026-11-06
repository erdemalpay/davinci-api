jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { AccountingService } from './accounting.service';

type Harness = {
  service: any;
  lookupQueries: number;
  productUpdates: { filter: any; update: any }[];
  countListUpdates: { filter: any; update: any }[];
};

const buildHarness = (): Harness => {
  const harness: Partial<Harness> = {
    lookupQueries: 0,
    productUpdates: [],
    countListUpdates: [],
  };
  // Hem tek seferlik liste (`find().select().lean()`) hem ada göre sorgu
  // (`await find({ name })`, `find({ name: { $in } })`) biçimini karşılar.
  const matchesName = (doc: any, name: any) =>
    name === undefined ||
    (name?.$in ? name.$in.includes(doc.name) : doc.name === name);
  const collection = (docs: any[]) => ({
    find: (filter: any = {}) => {
      harness.lookupQueries++;
      const found = docs.filter((doc) => matchesName(doc, filter.name));
      return Object.assign(Promise.resolve(found), {
        select: () => ({ lean: async () => found }),
      });
    },
  });
  const locations = [
    { _id: 2, name: 'Neorama' },
    { _id: 6, name: 'Depo' },
  ];

  const service = new (AccountingService as any)();
  service.expenseTypeModel = collection([{ _id: 'oys', name: 'Oyun Satışı' }]);
  service.vendorModel = collection([
    { _id: 'blackrock', name: 'Blackrock' },
    { _id: 'da_vinci', name: 'Da Vinci Board Game ' },
  ]);
  service.brandModel = collection([
    { _id: 'kutulu', name: 'Kutulu' },
    { _id: 'asmodee', name: 'Asmodee' },
  ]);
  service.countListModel = {
    ...collection([
      { _id: 'yerli', name: 'Yerli Oyunlar' },
      { _id: 'yabanci', name: 'Yabancı Oyunlar' },
    ]),
    updateMany: async (filter: any, update: any) => {
      harness.countListUpdates.push({ filter, update });
      return null;
    },
  };
  service.productModel = {
    ...collection([]),
    findOneAndUpdate: async (filter: any, update: any) => {
      harness.productUpdates.push({ filter, update });
      return { _id: filter.name };
    },
  };
  service.locationService = {
    findAllLocations: async () => {
      harness.lookupQueries++;
      return locations;
    },
  };
  service.menuService = {
    findNamesForBulkMatching: async () => {
      harness.lookupQueries++;
      return { categories: [], items: [] };
    },
  };
  service.websocketGateway = {
    emitCountListChanged: () => undefined,
    emitProductChanged: () => undefined,
  };
  service.logger = { error: () => undefined };
  harness.service = service;
  return harness as Harness;
};

describe('AccountingService.updateMultipleProduct', () => {
  it('resolves names to ids and keeps duplicates in expense type, vendor and brand', async () => {
    const harness = buildHarness();

    const errors = await harness.service.updateMultipleProduct([
      {
        name: 'Catan',
        expenseType: 'Oyun Satışı',
        vendor: 'Blackrock',
        brand: 'Kutulu, Asmodee, Kutulu',
      },
    ]);

    expect(errors).toEqual([]);
    expect(harness.productUpdates).toEqual([
      {
        filter: { name: 'Catan', deleted: false },
        update: {
          expenseType: ['oys'],
          vendor: ['blackrock'],
          brand: ['kutulu', 'asmodee', 'kutulu'],
        },
      },
    ]);
    expect(harness.countListUpdates).toEqual([]);
  });

  it('rejects a row whose brand does not exist and does not update it', async () => {
    const harness = buildHarness();

    const errors = await harness.service.updateMultipleProduct([
      { name: 'Catan', expenseType: 'Oyun Satışı', brand: 'Kutulu, Yok' },
    ]);

    expect(errors).toEqual([
      expect.objectContaining({
        name: 'Catan',
        errorNote: 'Brands are not written correctly',
      }),
    ]);
    expect(harness.productUpdates).toEqual([]);
  });

  it('drops unknown count lists and locations, and adds each one once', async () => {
    const harness = buildHarness();

    await harness.service.updateMultipleProduct([
      {
        name: 'Catan',
        countList: 'Yerli Oyunlar, Yok, Yerli Oyunlar',
        locations: 'Neorama, Neorama, Yok',
      },
    ]);

    expect(harness.productUpdates[0].update).toEqual({ countList: ['yerli'] });
    expect(harness.countListUpdates).toEqual([
      { filter: {}, update: { $pull: { products: { product: 'Catan' } } } },
      {
        filter: { _id: { $in: ['yerli'] } },
        update: { $push: { products: { product: 'Catan', locations: [2] } } },
      },
    ]);
  });

  it('matches names whose stored value has surrounding spaces', async () => {
    const harness = buildHarness();

    const errors = await harness.service.updateMultipleProduct([
      { name: 'Catan', vendor: 'Da Vinci Board Game' },
    ]);

    expect(errors).toEqual([]);
    expect(harness.productUpdates[0].update).toEqual({ vendor: ['da_vinci'] });
  });

  it('looks names up once, however many rows the file has', async () => {
    const few = buildHarness();
    const many = buildHarness();
    const row = (i: number) => ({
      name: `Oyun ${i}`,
      expenseType: 'Oyun Satışı',
      vendor: 'Blackrock',
      brand: 'Kutulu, Asmodee',
      countList: 'Yerli Oyunlar',
      locations: 'Neorama',
    });

    await few.service.updateMultipleProduct([row(1), row(2)]);
    await many.service.updateMultipleProduct(
      Array.from({ length: 1000 }, (_, i) => row(i)),
    );

    expect(many.lookupQueries).toBe(few.lookupQueries);
    expect(many.productUpdates).toHaveLength(1000);
  });
});
