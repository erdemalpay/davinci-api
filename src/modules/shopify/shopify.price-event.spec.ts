jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { ShopifyService } from './shopify.service';

type Mocked = Record<string, jest.Mock>;

const PRODUCT_ID = '8307077414969';
const VARIANT_ID = '45991376683065';
const PRICE_UPDATED = {
  data: { productVariantsBulkUpdate: { userErrors: [] } },
};

function buildService() {
  const menuService: Mocked = {
    bulkUpdateShopifyVariantIds: jest.fn(async () => undefined),
  };
  const websocketGateway: Mocked = {
    emitShopifyProductPriceChanged: jest.fn(),
    emitShopifyProductStockChanged: jest.fn(),
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
    websocketGateway as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const logger = (service as any).logger;
  for (const level of ['log', 'debug', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }

  const executeGraphQLRequest = jest
    .spyOn(service as any, 'executeGraphQLRequest')
    .mockResolvedValue(PRICE_UPDATED);

  return { service, websocketGateway, executeGraphQLRequest };
}

describe('ShopifyService fiyat güncellemesi websocket olayı', () => {
  describe('updateProductPrice', () => {
    it('fiyat güncellenince fiyat olayını yayar, stok olayını yaymaz', async () => {
      const { service, websocketGateway } = buildService();

      const result = await service.updateProductPrice(
        PRODUCT_ID,
        VARIANT_ID,
        2500,
      );

      expect(result).toBe(true);
      expect(
        websocketGateway.emitShopifyProductPriceChanged,
      ).toHaveBeenCalledTimes(1);
      expect(
        websocketGateway.emitShopifyProductStockChanged,
      ).not.toHaveBeenCalled();
    });

    it('Shopify hata dönerse hiçbir olay yaymaz', async () => {
      const { service, websocketGateway, executeGraphQLRequest } =
        buildService();
      executeGraphQLRequest.mockResolvedValue({
        data: {
          productVariantsBulkUpdate: {
            userErrors: [{ field: ['price'], message: 'invalid' }],
          },
        },
      });

      const result = await service.updateProductPrice(
        PRODUCT_ID,
        VARIANT_ID,
        2500,
      );

      expect(result).toBe(false);
      expect(
        websocketGateway.emitShopifyProductPriceChanged,
      ).not.toHaveBeenCalled();
      expect(
        websocketGateway.emitShopifyProductStockChanged,
      ).not.toHaveBeenCalled();
    });
  });

  describe('bulkUpdatePricesForProducts', () => {
    it('toplu güncelleme bitince fiyat olayını bir kez yayar, stok olayını yaymaz', async () => {
      const { service, websocketGateway, executeGraphQLRequest } =
        buildService();
      jest.spyOn(service, 'getAllProducts').mockResolvedValue([
        {
          id: `gid://shopify/Product/${PRODUCT_ID}`,
          variants: {
            edges: [
              {
                node: {
                  id: `gid://shopify/ProductVariant/${VARIANT_ID}`,
                  price: '2400.00',
                },
              },
            ],
          },
        },
      ] as never);

      await service.bulkUpdatePricesForProducts([
        { productId: PRODUCT_ID, variantId: VARIANT_ID, price: 2500 },
      ]);

      expect(executeGraphQLRequest).toHaveBeenCalledTimes(1);
      expect(
        websocketGateway.emitShopifyProductPriceChanged,
      ).toHaveBeenCalledTimes(1);
      expect(
        websocketGateway.emitShopifyProductStockChanged,
      ).not.toHaveBeenCalled();
    });
  });
});
