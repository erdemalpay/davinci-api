jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { AccountingService } from './accounting.service';

type CountListDoc = {
  _id: string;
  locations: number[];
  products: { product: string; locations: number[] }[];
};

const matches = (doc: CountListDoc, filter: any) => {
  if (filter['products.product']) {
    return doc.products.some(
      (item) => item.product === filter['products.product'],
    );
  }
  return filter._id.$in
    ? filter._id.$in.includes(doc._id)
    : doc._id === filter._id;
};

const buildService = (countLists: CountListDoc[]) => {
  let emittedCountListChange = 0;
  const service = new (AccountingService as any)();
  service.productModel = {
    findById: async (id: string) => ({ _id: id }),
    findByIdAndUpdate: async (id: string, updates: any) => ({
      _id: id,
      ...updates,
    }),
  };
  service.countListModel = {
    find: (filter: any) => ({
      select: () => ({
        lean: async () => countLists.filter((doc) => matches(doc, filter)),
      }),
    }),
    updateMany: async (filter: any, update: any) => {
      countLists
        .filter((doc) => matches(doc, filter))
        .forEach((doc) => {
          doc.products = doc.products.filter(
            (item) => item.product !== update.$pull.products.product,
          );
        });
    },
    updateOne: async (filter: any, update: any) => {
      countLists
        .filter((doc) => matches(doc, filter))
        .forEach((doc) => doc.products.push(update.$push.products));
    },
  };
  service.activityService = { addUpdateActivity: async () => undefined };
  service.websocketGateway = {
    emitCountListChanged: () => {
      emittedCountListChange += 1;
    },
    emitProductChanged: async () => undefined,
  };
  return { service, getEmitted: () => emittedCountListChange };
};

const productIn = (countList: CountListDoc, product: string) =>
  countList.products.find((item) => item.product === product);

describe('AccountingService.updateProduct count list membership', () => {
  const yerli = (): CountListDoc => ({
    _id: 'yerli_oyunlar',
    locations: [1, 2, 6],
    products: [{ product: 'mal_trago', locations: [2, 6] }],
  });
  const ithal = (): CountListDoc => ({
    _id: 'satilik_oyunlar',
    locations: [1, 2, 6],
    products: [],
  });

  it('keeps the product locations when the edit form sends the same count lists', async () => {
    const lists = [yerli(), ithal()];
    const { service, getEmitted } = buildService(lists);

    await service.updateProduct(null, 'mal_trago', {
      name: 'Mal Trago',
      countList: ['yerli_oyunlar'],
      locations: [],
    });

    expect(productIn(lists[0], 'mal_trago')?.locations).toEqual([2, 6]);
    expect(getEmitted()).toBe(0);
  });

  it('removes the product only from the dropped list and adds it to the new one with that list locations', async () => {
    const lists = [yerli(), ithal()];
    const { service, getEmitted } = buildService(lists);

    await service.updateProduct(null, 'mal_trago', {
      countList: ['satilik_oyunlar'],
    });

    expect(productIn(lists[0], 'mal_trago')).toBeUndefined();
    expect(productIn(lists[1], 'mal_trago')?.locations).toEqual([1, 2, 6]);
    expect(getEmitted()).toBe(1);
  });

  it('uses the given locations for a newly added list and leaves existing ones untouched', async () => {
    const lists = [yerli(), ithal()];
    const { service } = buildService(lists);

    await service.updateProduct(null, 'mal_trago', {
      countList: ['yerli_oyunlar', 'satilik_oyunlar'],
      locations: [6],
    });

    expect(productIn(lists[0], 'mal_trago')?.locations).toEqual([2, 6]);
    expect(productIn(lists[1], 'mal_trago')?.locations).toEqual([6]);
  });

  it('does not touch count lists when the update has no countList', async () => {
    const lists = [yerli(), ithal()];
    const { service, getEmitted } = buildService(lists);

    await service.updateProduct(null, 'mal_trago', { name: 'Mal Trago 2' });

    expect(productIn(lists[0], 'mal_trago')?.locations).toEqual([2, 6]);
    expect(getEmitted()).toBe(0);
  });
});
