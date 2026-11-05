jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { MenuService } from './menu.service';

type Mocked = Record<string, jest.Mock>;

const USER = { _id: 'erdem' } as never;

/** Prod'daki PTS kaydı: ürün eşleşmiş, stoktan düşme kuralı var. */
const fortunes = (over: any = {}) => ({
  _id: 1811,
  name: 'Fortunes of Scoundrel Bay',
  category: 26,
  additionalCategories: [],
  price: 4599,
  onlinePrice: 5979,
  priceHistory: [],
  matchedProduct: 'fortunes_of_scoundrel_bay',
  itemProduction: [
    {
      product: 'fortunes_of_scoundrel_bay',
      quantity: 1,
      isDecrementStock: true,
    },
  ],
  ...over,
});

function buildService(item: any) {
  const itemModel: Mocked = {
    findById: jest.fn(async () => item),
    find: jest.fn(async () => []),
    findByIdAndUpdate: jest.fn(async (_id: number, update: any) => ({
      ...item,
      ...update,
    })),
  };
  const accountingService: Mocked = {
    findProductById: jest.fn(async () => ({
      _id: item.matchedProduct,
      matchedMenuItem: item._id,
    })),
    updateItemProduct: jest.fn(async () => undefined),
  };

  const service = Object.create(MenuService.prototype) as any;
  Object.assign(service, {
    itemModel,
    accountingService,
    shopifyService: {
      resolveVariantId: jest.fn(),
      updateProductPrice: jest.fn(),
    },
    trendyolService: { updateProductPriceForMenuItem: jest.fn() },
    hepsiburadaService: { updateSingleItemPrice: jest.fn() },
    activityService: { addUpdateActivity: jest.fn() },
    websocketGateway: { emitItemChanged: jest.fn() },
    logger: { warn: jest.fn(), log: jest.fn(), error: jest.fn() },
  });

  return { service, itemModel, accountingService };
}

const sentUpdate = (itemModel: Mocked) =>
  itemModel.findByIdAndUpdate.mock.calls[0][1];

describe.each(['updateItem', 'updateProductItem'])(
  'MenuService.%s eşleşen ürün',
  (method) => {
    it('matchedProduct gönderilmeyen kısmi güncelleme eşleşmeyi korur', async () => {
      const { service, itemModel, accountingService } = buildService(
        fortunes(),
      );

      await service[method](USER, 1811, {
        imageUrl: 'https://res.cloudinary.com/x.jpg',
        productImages: [],
      });

      expect(accountingService.updateItemProduct).not.toHaveBeenCalled();
      expect(sentUpdate(itemModel).itemProduction).toBeUndefined();
    });

    it.each([
      ['boş string', ''],
      ['null', null],
    ])('matchedProduct %s gelirse eşleşme kaldırılır', async (_l, value) => {
      const { service, itemModel, accountingService } = buildService(
        fortunes(),
      );

      await service[method](USER, 1811, { matchedProduct: value });

      expect(accountingService.updateItemProduct).toHaveBeenCalledWith(
        USER,
        'fortunes_of_scoundrel_bay',
        { matchedMenuItem: null },
      );
      expect(sentUpdate(itemModel).itemProduction).toEqual([]);
    });
  },
);
