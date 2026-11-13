jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { AccountingService } from './accounting.service';

type Write = { filter: unknown; update: unknown };
type BulkOp = { updateOne?: Write; updateMany?: Write };

type Harness = {
  service: any;
  lookupQueries: number;
  productUpdates: Write[];
  countListUpdates: Write[];
  productBulkWrites: number;
  countListBulkWrites: number;
  countListEmits: number;
  // Veritabanındaki ürün adları; varsayılan: istenen her ad birebir var
  storedProductNames?: string[];
  // Bu sıradaki yazma çağrısında bu sıradaki işlem hata verir
  failProductWrite?: { call: number; opIndex: number };
};

// Sıralı bulkWrite gibi davranır: hatalı işleme kadar olanları uygular
const bulkWrite = (log: Write[], ops: BulkOp[], failAt: number | undefined) => {
  for (const [opIndex, op] of ops.entries()) {
    if (opIndex === failAt) {
      return Promise.reject({ writeErrors: [{ index: opIndex }] });
    }
    log.push((op.updateOne ?? op.updateMany) as Write);
  }
  return Promise.resolve(null);
};

const buildHarness = (): Harness => {
  const harness: Partial<Harness> = {
    lookupQueries: 0,
    productUpdates: [],
    countListUpdates: [],
    productBulkWrites: 0,
    countListBulkWrites: 0,
    countListEmits: 0,
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
    bulkWrite: (ops: BulkOp[]) => {
      harness.countListBulkWrites++;
      return bulkWrite(harness.countListUpdates, ops, undefined);
    },
  };
  service.productModel = {
    find: (filter: { name?: { $in: string[] } }) => {
      harness.lookupQueries++;
      const names = filter.name?.$in ?? [];
      const stored = harness.storedProductNames ?? names;
      const found = names
        .filter((name) => stored.includes(name))
        .map((name) => ({ _id: name, name }));
      return { select: () => ({ lean: async () => found }) };
    },
    bulkWrite: (ops: BulkOp[]) => {
      harness.productBulkWrites++;
      const fail = harness.failProductWrite;
      return bulkWrite(
        harness.productUpdates,
        ops,
        fail?.call === harness.productBulkWrites ? fail.opIndex : undefined,
      );
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
    emitCountListChanged: () => {
      harness.countListEmits++;
    },
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
        filter: { _id: 'Catan' },
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
      {
        filter: { 'products.product': 'Catan' },
        update: { $pull: { products: { product: 'Catan' } } },
      },
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

  it('writes all rows in one call per collection and notifies once', async () => {
    const harness = buildHarness();
    const row = (i: number) => ({
      name: `Oyun ${i}`,
      countList: 'Yerli Oyunlar',
      locations: 'Neorama',
    });

    await harness.service.updateMultipleProduct(
      Array.from({ length: 1000 }, (_, i) => row(i)),
    );

    expect(harness.productBulkWrites).toBe(1);
    expect(harness.countListBulkWrites).toBe(1);
    expect(harness.productUpdates).toHaveLength(1000);
    expect(harness.countListUpdates).toHaveLength(2000);
    expect(harness.countListEmits).toBe(1);
  });

  it('finds the product by its exact name, like before', async () => {
    const harness = buildHarness();
    harness.storedProductNames = ['Catan '];

    const errors = await harness.service.updateMultipleProduct([
      { name: 'Catan', countList: 'Yerli Oyunlar' },
    ]);

    expect(errors).toEqual([]);
    expect(harness.productUpdates).toEqual([]);
    expect(harness.countListUpdates).toEqual([]);
    expect(harness.countListEmits).toBe(0);
  });

  it('reports a row whose write fails and keeps writing the others', async () => {
    const harness = buildHarness();
    harness.failProductWrite = { call: 1, opIndex: 1 };

    const errors = await harness.service.updateMultipleProduct([
      { name: 'Catan', countList: 'Yerli Oyunlar' },
      { name: 'Azul', countList: 'Yerli Oyunlar' },
      { name: 'Splendor', countList: 'Yerli Oyunlar' },
    ]);

    expect(errors).toEqual([
      expect.objectContaining({ name: 'Azul', errorNote: 'Error occured' }),
    ]);
    expect(harness.productUpdates.map((u) => u.filter)).toEqual([
      { _id: 'Catan' },
      { _id: 'Splendor' },
    ]);
    // Yazılamayan ürünün sayım listesine dokunulmaz
    expect(
      harness.countListUpdates.map((u) => JSON.stringify(u.filter)),
    ).not.toContain(JSON.stringify({ 'products.product': 'Azul' }));
    expect(harness.countListUpdates).toHaveLength(4);
  });
});
