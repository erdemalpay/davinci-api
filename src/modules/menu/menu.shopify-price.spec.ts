jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { HttpException, HttpStatus } from '@nestjs/common';
import { MenuService } from './menu.service';

type Mocked = Record<string, jest.Mock>;

const USER = { _id: 'cem' } as never;

/** Prod'daki Armageddon kaydı: shopifyId var, shopifyVariantId YOK. */
const armageddon = (over: any = {}) => ({
  _id: 1742,
  name: 'Warhammer 40K: Armageddon (İngilizce)',
  category: 26,
  additionalCategories: [],
  price: 15999,
  onlinePrice: 19999,
  priceHistory: [],
  itemProduction: [],
  shopifyId: '8307077414969',
  ...over,
});

function buildService(item: any) {
  const itemModel: Mocked = {
    findById: jest.fn(async () => item),
    findByIdAndUpdate: jest.fn(async (_id: number, update: any) => ({
      ...item,
      ...update,
    })),
  };

  const shopifyService: Mocked = {
    resolveVariantId: jest.fn(async (_p: string, known?: string) => known),
    updateProductPrice: jest.fn(async () => true),
  };

  const trendyolService: Mocked = { updateProductPriceForMenuItem: jest.fn() };
  const websocketGateway: Mocked = { emitItemChanged: jest.fn() };

  const service = Object.create(MenuService.prototype) as any;
  Object.assign(service, {
    itemModel,
    shopifyService,
    trendyolService,
    hepsiburadaService: { updateSingleItemPrice: jest.fn() },
    activityService: { addUpdateActivity: jest.fn() },
    websocketGateway,
    logger: { warn: jest.fn(), log: jest.fn(), error: jest.fn() },
  });

  return {
    service,
    itemModel,
    shopifyService,
    trendyolService,
    websocketGateway,
  };
}

describe('MenuService.updateItem Shopify fiyat güncelleme', () => {
  describe('mevcut davranış korunmalı', () => {
    it("variantId dolu kalemde fiyat Shopify'a gider", async () => {
      const item = armageddon({ shopifyVariantId: '45991376683065' });
      const { service, shopifyService } = buildService(item);

      await service.updateItem(USER, 1742, { price: 14999 });

      expect(shopifyService.resolveVariantId).toHaveBeenCalledWith(
        '8307077414969',
        '45991376683065',
      );
      expect(shopifyService.updateProductPrice).toHaveBeenCalledWith(
        '8307077414969',
        '45991376683065',
        14999,
      );
    });

    it("fiyat değişmediyse Shopify'a hiç gitmez", async () => {
      const { service, shopifyService } = buildService(armageddon());

      await service.updateItem(USER, 1742, { price: 15999 });

      expect(shopifyService.resolveVariantId).not.toHaveBeenCalled();
      expect(shopifyService.updateProductPrice).not.toHaveBeenCalled();
    });

    it("Shopify ile bağlı olmayan kalemde Shopify'a gitmez", async () => {
      const item = armageddon({ shopifyId: undefined });
      const { service, shopifyService } = buildService(item);

      await service.updateItem(USER, 1742, { price: 14999 });

      expect(shopifyService.resolveVariantId).not.toHaveBeenCalled();
      expect(shopifyService.updateProductPrice).not.toHaveBeenCalled();
    });
  });

  describe('variantId boşsa (Armageddon)', () => {
    it("variantId Shopify'dan çözülür ve fiyat yine de Shopify'a gider", async () => {
      const { service, shopifyService } = buildService(armageddon());
      shopifyService.resolveVariantId.mockResolvedValue('45991376683065');

      await service.updateItem(USER, 1742, { price: 14999 });

      expect(shopifyService.resolveVariantId).toHaveBeenCalledWith(
        '8307077414969',
        undefined,
      );
      expect(shopifyService.updateProductPrice).toHaveBeenCalledWith(
        '8307077414969',
        '45991376683065',
        14999,
      );
    });

    it('variantId çözülemezse fiyat güncellemesi atlanır, panel kaydı patlamaz', async () => {
      const { service, itemModel, shopifyService } = buildService(armageddon());
      shopifyService.resolveVariantId.mockResolvedValue(undefined);

      await expect(
        service.updateItem(USER, 1742, { price: 14999 }),
      ).resolves.toMatchObject({ price: 14999 });

      expect(itemModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
      expect(shopifyService.updateProductPrice).not.toHaveBeenCalled();
    });
  });

  /**
   * Shopify hata verirse ne olduğunu sabitler. updateProductPrice ağ/GraphQL
   * hatasında HttpException fırlatır, userErrors'ta ise false döner (sessiz).
   */
  describe('Shopify hata verirse', () => {
    const withTrendyol = () =>
      armageddon({ trendyolBarcode: '5011921266159', shopifyVariantId: '1' });

    it("fiyat güncellemesi fırlatırsa panel 500 alır; fiyat DB'de kalır, kalan adımlar çalışmaz", async () => {
      const {
        service,
        itemModel,
        shopifyService,
        trendyolService,
        websocketGateway,
      } = buildService(withTrendyol());
      shopifyService.updateProductPrice.mockRejectedValue(
        new HttpException(
          'Unable to update product price.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        ),
      );

      await expect(
        service.updateItem(USER, 1742, { price: 14999, onlinePrice: 20999 }),
      ).rejects.toMatchObject({
        message: 'Unable to update product price.',
        status: 500,
      });

      expect(itemModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
      expect(websocketGateway.emitItemChanged).not.toHaveBeenCalled();
      expect(
        trendyolService.updateProductPriceForMenuItem,
      ).not.toHaveBeenCalled();
    });

    it("variantId çözerken Shopify hata verirse aynı şekilde 500 döner (variantId'si boş ürünler)", async () => {
      const item = armageddon({ trendyolBarcode: '5011921266159' });
      const { service, itemModel, shopifyService, trendyolService } =
        buildService(item);
      shopifyService.resolveVariantId.mockRejectedValue(
        new HttpException(
          'Unable to fetch product 8307077414969 from Shopify.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        ),
      );

      await expect(
        service.updateItem(USER, 1742, { price: 14999, onlinePrice: 20999 }),
      ).rejects.toMatchObject({
        message: 'Unable to fetch product 8307077414969 from Shopify.',
        status: 500,
      });

      expect(itemModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
      expect(shopifyService.updateProductPrice).not.toHaveBeenCalled();
      expect(
        trendyolService.updateProductPriceForMenuItem,
      ).not.toHaveBeenCalled();
    });

    it('Shopify userErrors dönerse (false) hata fırlatılmaz, sessizce geçilir', async () => {
      const { service, shopifyService, trendyolService } = buildService(
        withTrendyol(),
      );
      shopifyService.updateProductPrice.mockResolvedValue(false);

      await expect(
        service.updateItem(USER, 1742, { price: 14999, onlinePrice: 20999 }),
      ).resolves.toMatchObject({ price: 14999 });

      expect(
        trendyolService.updateProductPriceForMenuItem,
      ).toHaveBeenCalledTimes(1);
    });
  });
});
