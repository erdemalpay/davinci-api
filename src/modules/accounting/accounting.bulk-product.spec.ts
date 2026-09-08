jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { AccountingService } from './accounting.service';

const collection = (docs: any[]) => ({
  find: () => ({ select: () => ({ lean: async () => docs }) }),
});

type Harness = {
  service: any;
  productModel: any;
  savedProducts: any[];
  removedProductIds: any[];
  countListUpdates: any[];
  createdMenuItems: any[];
  deletedMenuItemIds: number[];
  bulkItemUpdates: any[];
  emittedCountListChange: number;
  failures: {
    productSave?: string;
    menuItemCreate?: string;
    menuItemDelete?: boolean;
  };
  images: Record<string, string | 'THROW'>;
};

const buildHarness = (
  existingProducts: { _id: string; name: string }[] = [],
  existingMenuItems: { _id: number; name: string }[] = [],
): Harness => {
  const harness: Partial<Harness> = {
    savedProducts: [],
    removedProductIds: [],
    countListUpdates: [],
    createdMenuItems: [],
    deletedMenuItemIds: [],
    bulkItemUpdates: [],
    emittedCountListChange: 0,
    failures: {},
    images: {
      'oyunlar/var.jpeg': 'https://cdn/var.jpg',
      'oyunlar/ikinci.jpeg': 'https://cdn/ikinci.jpg',
      'oyunlar/yok.jpeg': '',
      'oyunlar/patlak.jpeg': 'THROW',
    },
  };

  function ProductModel(this: any, doc: any) {
    Object.assign(this, doc);
    this.save = async () => {
      if (harness.failures.productSave === this._id) {
        throw new Error('duplicate key');
      }
      harness.savedProducts.push({ ...this });
      return this;
    };
  }
  (ProductModel as any).find = () => ({
    select: () => ({ lean: async () => existingProducts }),
  });
  (ProductModel as any).findByIdAndUpdate = async (id: any, updates: any) => {
    harness.savedProducts
      .filter((product) => product._id === id)
      .forEach((product) => Object.assign(product, updates));
    return null;
  };
  (ProductModel as any).findByIdAndRemove = async (id: any) => {
    harness.removedProductIds.push(id);
    return null;
  };

  const service = new (AccountingService as any)();
  service.productModel = ProductModel;
  service.expenseTypeModel = collection([{ _id: 'oys', name: 'Oyun Satışı' }]);
  service.vendorModel = collection([
    { _id: 'blackrock', name: 'Blackrock' },
    { _id: 'da_vinci_board_game_', name: 'Da Vinci Board Game ' },
  ]);
  service.brandModel = collection([
    { _id: 'da_vinci_board_game', name: 'Da Vinci Board Game' },
  ]);
  service.countListModel = {
    ...collection([{ _id: 'yerli_oyunlar', name: 'Yerli Oyunlar' }]),
    updateMany: async (filter: any, update: any) => {
      harness.countListUpdates.push({ filter, update });
      return null;
    },
  };
  service.locationService = {
    findAllLocations: async () => [
      { _id: 1, name: 'Bahçeli' },
      { _id: 2, name: 'Neorama' },
      { _id: 6, name: 'Neorama Depo' },
    ],
    findStockLocations: async () => [{ _id: 1 }, { _id: 2 }],
  };
  service.menuService = {
    findNamesForBulkMatching: async () => ({
      categories: [{ _id: 25, name: 'Yerli Oyunlar' }],
      items: existingMenuItems,
    }),
    createBulkMenuItemWithProduct: async (dto: any) => {
      if (harness.failures.menuItemCreate === dto.name) {
        throw new Error('menu item save failed');
      }
      const item = { _id: 1000 + harness.createdMenuItems.length, ...dto };
      harness.createdMenuItems.push(item);
      return item;
    },
    updateForBulkItem: async (
      id: number,
      product: string,
      itemProduction?: any[],
    ) => {
      harness.bulkItemUpdates.push({ id, product, itemProduction });
    },
    deleteMenuItem: async (id: number) => {
      if (harness.failures.menuItemDelete) {
        throw new Error('menu item delete failed');
      }
      harness.deletedMenuItemIds.push(id);
    },
  };
  service.assetService = {
    getImageWithPublicID: async (publicId: string) => {
      const result = harness.images[publicId];
      if (result === 'THROW') throw new Error('cloudinary unreachable');
      return result ?? '';
    },
  };
  service.websocketGateway = {
    emitCountListChanged: () => {
      harness.emittedCountListChange += 1;
    },
    emitBulkProductAndMenuItemChanged: () => undefined,
  };
  service.logger = { error: () => undefined, log: () => undefined };

  harness.service = service;
  harness.productModel = ProductModel;
  return harness as Harness;
};

const row = (overrides: Record<string, unknown> = {}) => ({
  name: 'Yeni Oyun',
  expenseType: 'Oyun Satışı',
  brand: 'Da Vinci Board Game',
  vendor: 'Blackrock',
  countList: 'Yerli Oyunlar',
  locations: 'Neorama',
  image: '',
  category: 'Yerli Oyunlar',
  itemProduction: '',
  price: 100,
  ...overrides,
});

describe('AccountingService.validateBulkProductAndMenuItem', () => {
  const validate = async (rows: any[], harness = buildHarness()) => {
    const notes = await harness.service.validateBulkProductAndMenuItem(rows);
    return { notes, harness };
  };

  it('accepts a fully valid row', async () => {
    const { notes } = await validate([row()]);
    expect(notes).toEqual([null]);
  });

  it('writes nothing at all', async () => {
    const { harness } = await validate([
      row(),
      row({ name: 'Ikinci', vendor: 'Yok Boyle' }),
    ]);
    expect(harness.savedProducts).toEqual([]);
    expect(harness.createdMenuItems).toEqual([]);
    expect(harness.countListUpdates).toEqual([]);
  });

  it('returns one entry per input row, in order, including empty rows', async () => {
    const { notes } = await validate([
      row({ name: 'Bir' }),
      {},
      row({ name: 'Uc', vendor: 'Yok Boyle' }),
    ]);
    expect(notes).toHaveLength(3);
    expect(notes[0]).toBeNull();
    expect(notes[1]).toBeNull();
    expect(notes[2]).toBe('Vendor not found: Yok Boyle');
  });

  it('matches stored names that have stray whitespace', async () => {
    const { notes } = await validate([row({ vendor: 'Da Vinci Board Game' })]);
    expect(notes).toEqual([null]);
  });

  it.each([
    ['vendor', { vendor: 'Yok Boyle' }, 'Vendor not found: Yok Boyle'],
    ['brand', { brand: 'Yok Marka' }, 'Brand not found: Yok Marka'],
    [
      'expense type',
      { expenseType: 'Yok Gider' },
      'Expense type not found: Yok Gider',
    ],
    [
      'count list',
      { countList: 'Yok Liste' },
      'Count list not found: Yok Liste',
    ],
    [
      'menu category',
      { category: 'Yok Kategori' },
      'Menu category not found: Yok Kategori',
    ],
  ])('reports an unknown %s by name', async (_label, overrides, expected) => {
    const { notes } = await validate([row(overrides)]);
    expect(notes).toEqual([expected]);
  });

  it('validates locations even when no count list is given', async () => {
    const { notes } = await validate([
      row({ countList: '', locations: 'Yok Lokasyon' }),
    ]);
    expect(notes).toEqual(['Location not found: Yok Lokasyon']);
  });

  it('names every unknown entry in a comma separated cell', async () => {
    const { notes } = await validate([
      row({ vendor: 'Blackrock,Yok A,Yok B' }),
    ]);
    expect(notes).toEqual(['Vendor not found: Yok A, Yok B']);
  });

  it('rejects a row without a name', async () => {
    const { notes } = await validate([row({ name: '   ' })]);
    expect(notes).toEqual(['Name field not provided']);
  });

  it('rejects a row that carries nothing but a name', async () => {
    const { notes } = await validate([
      {
        name: 'Yalniz Ad',
        expenseType: '',
        brand: '',
        vendor: '',
        countList: '',
        locations: '',
        category: '',
        price: '',
      },
    ]);
    expect(notes).toEqual(['No product or menu item information provided']);
  });

  it('requires an expense type once any other product column is used', async () => {
    const { notes } = await validate([
      row({ expenseType: '', category: '', price: '' }),
    ]);
    expect(notes).toEqual(['Missing fields: Expense Type']);
  });

  it('requires category and price once any menu column is used', async () => {
    const { notes } = await validate([
      row({ category: '', price: '', description: 'sadece aciklama' }),
    ]);
    expect(notes).toEqual(['Missing fields: Menu Category, Price']);
  });

  it('rejects a name that already exists in the database', async () => {
    const harness = buildHarness([{ _id: 'var_olan', name: 'Var Olan' }]);
    const { notes } = await validate([row({ name: 'Var Olan' })], harness);
    expect(notes).toEqual(['Product already created']);
  });

  it('rejects a menu item name that already exists in the database', async () => {
    const harness = buildHarness([], [{ _id: 7, name: 'Var Olan Menu' }]);
    const { notes } = await validate(
      [
        row({
          name: 'Var Olan Menu',
          expenseType: '',
          brand: '',
          vendor: '',
          countList: '',
          locations: '',
        }),
      ],
      harness,
    );
    expect(notes).toEqual(['Menu Item already created']);
  });

  it('rejects a name repeated inside the same file', async () => {
    const { notes } = await validate([row(), row()]);
    expect(notes).toEqual([null, 'Product already created']);
  });

  it('accepts an ingredient created by an earlier row of the same file', async () => {
    const { notes } = await validate([
      row({ name: 'Ana Urun' }),
      row({
        name: 'Malzemeli',
        expenseType: '',
        brand: '',
        vendor: '',
        countList: '',
        locations: '',
        itemProduction: 'Ana Urun_3',
      }),
    ]);
    expect(notes).toEqual([null, null]);
  });

  it('rejects an unknown ingredient', async () => {
    const { notes } = await validate([
      row({ itemProduction: 'Olmayan Urun_2' }),
    ]);
    expect(notes).toEqual(['Ingredient not found: Olmayan Urun']);
  });

  it('does not treat an earlier rejected row as available for ingredients', async () => {
    const { notes } = await validate([
      row({ name: 'Bozuk Urun', vendor: 'Yok Boyle' }),
      row({
        name: 'Malzemeli',
        expenseType: '',
        brand: '',
        vendor: '',
        countList: '',
        locations: '',
        itemProduction: 'Bozuk Urun',
      }),
    ]);
    expect(notes).toEqual([
      'Vendor not found: Yok Boyle',
      'Ingredient not found: Bozuk Urun',
    ]);
  });

  it('reports a missing image', async () => {
    const { notes } = await validate([row({ image: 'oyunlar/yok.jpeg' })]);
    expect(notes).toEqual(['Image not found: oyunlar/yok.jpeg']);
  });

  it('separates an unreachable image service from a missing image', async () => {
    const { notes } = await validate([row({ image: 'oyunlar/patlak.jpeg' })]);
    expect(notes).toEqual(['Image could not be checked: oyunlar/patlak.jpeg']);
  });
});

describe('AccountingService.addMultipleProductAndMenuItem', () => {
  it('creates the product and the menu item and links them together', async () => {
    const harness = buildHarness();
    const errors = await harness.service.addMultipleProductAndMenuItem([
      row({ name: 'Yeni Oyun', image: 'oyunlar/var.jpeg' }),
    ]);

    expect(errors).toEqual([]);
    expect(harness.savedProducts).toHaveLength(1);
    expect(harness.savedProducts[0]).toMatchObject({
      _id: 'yeni_oyun',
      name: 'Yeni Oyun',
      expenseType: ['oys'],
      vendor: ['blackrock'],
      brand: ['da_vinci_board_game'],
      countList: ['yerli_oyunlar'],
      matchedMenuItem: 1000,
    });
    expect(harness.createdMenuItems[0]).toMatchObject({
      name: 'Yeni Oyun',
      category: 25,
      price: 100,
      imageUrl: 'https://cdn/var.jpg',
    });
  });

  it('adds the product to its count list with the given locations', async () => {
    const harness = buildHarness();
    await harness.service.addMultipleProductAndMenuItem([
      row({ locations: 'Neorama,Neorama Depo' }),
    ]);

    expect(harness.countListUpdates).toHaveLength(1);
    expect(harness.countListUpdates[0].update.$addToSet.products).toEqual({
      product: 'yeni_oyun',
      locations: [2, 6],
    });
  });

  it('keeps the ingredients coming from the file', async () => {
    const harness = buildHarness();
    await harness.service.addMultipleProductAndMenuItem([
      row({ name: 'Ana Urun' }),
      row({ name: 'Malzemeli', itemProduction: 'Ana Urun_2' }),
    ]);

    const update = harness.bulkItemUpdates.find(
      (entry) => entry.product === 'malzemeli',
    );
    expect(update.itemProduction).toEqual([
      { product: 'ana_urun', quantity: 2, isDecrementStock: true },
    ]);
  });

  it('writes nothing for an invalid row but still processes the valid ones', async () => {
    const harness = buildHarness();
    const errors = await harness.service.addMultipleProductAndMenuItem([
      row({ name: 'Bozuk', vendor: 'Yok Boyle' }),
      row({ name: 'Saglam' }),
    ]);

    expect(errors).toHaveLength(1);
    expect(errors[0].errorNote).toBe('Vendor not found: Yok Boyle');
    expect(harness.savedProducts.map((product) => product._id)).toEqual([
      'saglam',
    ]);
    expect(harness.createdMenuItems).toHaveLength(1);
  });

  it('rolls the product back when the menu item cannot be created', async () => {
    const harness = buildHarness();
    harness.failures.menuItemCreate = 'Yeni Oyun';
    const errors = await harness.service.addMultipleProductAndMenuItem([row()]);

    expect(errors[0].errorNote).toBe('Error occured');
    expect(harness.removedProductIds).toEqual(['yeni_oyun']);
    const pull = harness.countListUpdates.find((entry) => entry.update.$pull);
    expect(pull.update.$pull.products).toEqual({ product: 'yeni_oyun' });
    expect(harness.emittedCountListChange).toBe(2);
  });

  it('still removes the product when deleting the menu item fails', async () => {
    const harness = buildHarness();
    harness.failures.menuItemCreate = undefined;
    harness.failures.menuItemDelete = true;
    harness.service.productModel.findByIdAndUpdate = async () => {
      throw new Error('matching failed');
    };

    const errors = await harness.service.addMultipleProductAndMenuItem([row()]);

    expect(errors[0].errorNote).toBe('Error occured');
    expect(harness.deletedMenuItemIds).toEqual([]);
    expect(harness.removedProductIds).toEqual(['yeni_oyun']);
  });

  it('never removes a document it did not create when the save itself fails', async () => {
    const harness = buildHarness();
    harness.failures.productSave = 'yeni_oyun';
    const errors = await harness.service.addMultipleProductAndMenuItem([row()]);

    expect(errors[0].errorNote).toBe('Error occured');
    expect(harness.removedProductIds).toEqual([]);
    expect(harness.createdMenuItems).toEqual([]);
  });

  it('skips rows that are entirely empty without reporting them', async () => {
    const harness = buildHarness();
    const errors = await harness.service.addMultipleProductAndMenuItem([{}]);

    expect(errors).toEqual([]);
    expect(harness.savedProducts).toEqual([]);
  });
});
