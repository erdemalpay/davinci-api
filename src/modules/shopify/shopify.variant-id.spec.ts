jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { ShopifyService } from './shopify.service';

type Mocked = Record<string, jest.Mock>;

/**
 * Prod'dan alinan GERCEK cevap: Warhammer 40K Armageddon, menu kaleminde
 * shopifyVariantId yoktu ve panelden fiyat degisince Shopify guncellenmedi.
 */
const ARMAGEDDON_SHOPIFY_ID = '8307077414969';
const ARMAGEDDON_PRODUCT = {
  id: 'gid://shopify/Product/8307077414969',
  title: 'Warhammer 40K: Armageddon (İngilizce)',
  variants: {
    edges: [{ node: { id: 'gid://shopify/ProductVariant/45991376683065' } }],
  },
};

function buildService() {
  const menuService: Mocked = {
    bulkUpdateShopifyVariantIds: jest.fn(async () => undefined),
  };

  const service = new ShopifyService(
    { get: jest.fn(() => 'example.myshopify.com') } as never,
    {} as never,
    {} as never,
    {} as never,
    menuService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const logger = (service as any).logger;
  for (const level of ['log', 'debug', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }

  const getProductById = jest.spyOn(service, 'getProductById');

  return { service, menuService, getProductById };
}

describe('ShopifyService.resolveVariantId', () => {
  describe('mevcut davranış korunmalı', () => {
    it("menü kaleminde variantId varsa Shopify'a sormadan aynen döner", async () => {
      const { service, menuService, getProductById } = buildService();

      const variantId = await service.resolveVariantId(
        ARMAGEDDON_SHOPIFY_ID,
        '45991376683065',
      );

      expect(variantId).toBe('45991376683065');
      expect(getProductById).not.toHaveBeenCalled();
      expect(menuService.bulkUpdateShopifyVariantIds).not.toHaveBeenCalled();
    });
  });

  describe('variantId boşsa (Armageddon)', () => {
    it("ürünün ilk varyantını Shopify'dan bulup sayısal ID olarak döner", async () => {
      const { service, getProductById } = buildService();
      getProductById.mockResolvedValue(ARMAGEDDON_PRODUCT as never);

      const variantId = await service.resolveVariantId(
        ARMAGEDDON_SHOPIFY_ID,
        undefined,
      );

      expect(getProductById).toHaveBeenCalledWith(ARMAGEDDON_SHOPIFY_ID);
      expect(variantId).toBe('45991376683065');
    });

    it("bulunan variantId bir sonraki sefer sorulmasın diye DB'ye yazılır", async () => {
      const { service, menuService, getProductById } = buildService();
      getProductById.mockResolvedValue(ARMAGEDDON_PRODUCT as never);

      await service.resolveVariantId(ARMAGEDDON_SHOPIFY_ID, undefined);

      expect(menuService.bulkUpdateShopifyVariantIds).toHaveBeenCalledTimes(1);
      expect(menuService.bulkUpdateShopifyVariantIds).toHaveBeenCalledWith(
        new Map([[ARMAGEDDON_SHOPIFY_ID, '45991376683065']]),
      );
    });

    it('boş string de eksik sayılır (DB\'de "" kalan kayıtlar)', async () => {
      const { service, getProductById } = buildService();
      getProductById.mockResolvedValue(ARMAGEDDON_PRODUCT as never);

      const variantId = await service.resolveVariantId(
        ARMAGEDDON_SHOPIFY_ID,
        '',
      );

      expect(getProductById).toHaveBeenCalledTimes(1);
      expect(variantId).toBe('45991376683065');
    });

    it("DB'ye yazma patlasa bile variantId döner, fiyat güncellemesi engellenmez", async () => {
      const { service, menuService, getProductById } = buildService();
      getProductById.mockResolvedValue(ARMAGEDDON_PRODUCT as never);
      menuService.bulkUpdateShopifyVariantIds.mockRejectedValue(
        new Error('db down'),
      );

      const variantId = await service.resolveVariantId(
        ARMAGEDDON_SHOPIFY_ID,
        undefined,
      );

      expect(variantId).toBe('45991376683065');
    });

    it("ürün Shopify'da bulunamazsa undefined döner ve DB'ye yazmaz", async () => {
      const { service, menuService, getProductById } = buildService();
      getProductById.mockResolvedValue(null as never);

      const variantId = await service.resolveVariantId(
        ARMAGEDDON_SHOPIFY_ID,
        undefined,
      );

      expect(variantId).toBeUndefined();
      expect(menuService.bulkUpdateShopifyVariantIds).not.toHaveBeenCalled();
    });

    it("ürünün hiç varyantı yoksa undefined döner ve DB'ye yazmaz", async () => {
      const { service, menuService, getProductById } = buildService();
      getProductById.mockResolvedValue({
        ...ARMAGEDDON_PRODUCT,
        variants: { edges: [] },
      } as never);

      const variantId = await service.resolveVariantId(
        ARMAGEDDON_SHOPIFY_ID,
        undefined,
      );

      expect(variantId).toBeUndefined();
      expect(menuService.bulkUpdateShopifyVariantIds).not.toHaveBeenCalled();
    });
  });
});
