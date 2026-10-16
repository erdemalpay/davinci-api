jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { TrendyolService } from './trendyol.service';

/**
 * 2026-10-15 prod vakası: Trendyol'da Hues and Cues varyantının stockCode'u boş,
 * menüde 60 ürünün trendyolBarcode'u "" idi. Toplu stok güncellemesi bu ürünlerin
 * stoklarını Hues barkoduyla gönderiyor, Trendyol ilkini (Pre-Rift Kit, 17) uyguluyordu.
 */
const HUES_TRENDYOL_PRODUCT = {
  contentId: 1145325615,
  variantId: 1,
  productMainId: 'huesandcues',
  barcode: '700304153760',
  stockCode: '',
  quantity: 18, // 2026-10-02'de Trendyol'da görülen değer

  salePrice: 2187.5,
  listPrice: 2187.5,
};

const MENU_ITEMS = [
  {
    _id: 1697,
    matchedProduct: 'prerelease_event_kit_unleashed',
    trendyolBarcode: '',
  },
  {
    _id: 1509,
    matchedProduct: 'hues_and_cues_us_reprint',
    trendyolBarcode: '700304153760',
  },
];

const STOCK_BY_PRODUCT: Record<string, number> = {
  prerelease_event_kit_unleashed: 17,
  hues_and_cues_us_reprint: 0,
};

function buildService() {
  const menuService = {
    getAllTrendyolItems: jest.fn(async () => MENU_ITEMS),
  };
  const accountingService = {
    findProductStockByLocation: jest.fn(async (product: string) => [
      { quantity: STOCK_BY_PRODUCT[product] },
    ]),
  };

  const service = new TrendyolService(
    { get: jest.fn(() => 'https://example.test') } as never,
    {} as never,
    {} as never,
    menuService as never,
    accountingService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  jest
    .spyOn(service, 'getAllProductsComplete')
    .mockResolvedValue([HUES_TRENDYOL_PRODUCT]);
  const sendBatches = jest
    .spyOn(service as any, 'sendPriceAndInventoryBatches')
    .mockResolvedValue({ success: true });
  const updatePriceAndInventory = jest
    .spyOn(service, 'updatePriceAndInventory')
    .mockResolvedValue(undefined as never);

  const logger = (service as any).logger;
  for (const level of ['log', 'debug', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }

  return { service, sendBatches, updatePriceAndInventory };
}

describe('TrendyolService boş barkod eşleştirmesi', () => {
  it('toplu stok güncellemesinde boş barkodlu ürünü Hues and Cues ile eşleştirmez', async () => {
    const { service, sendBatches } = buildService();

    await service.updateInventoryOnly();

    expect(sendBatches).toHaveBeenCalledWith([
      {
        barcode: '700304153760',
        quantity: 0,
        salePrice: 2187.5,
        listPrice: 2187.5,
      },
    ]);
  });

  it('tek ürün stok güncellemesi boş barkodla Trendyol ürününe dokunmaz', async () => {
    const { service, updatePriceAndInventory } = buildService();

    await expect(service.updateProductStock('', 6, 17)).resolves.toBe(false);
    await expect(service.updateProductStock('  ', 6, 17)).resolves.toBe(false);
    expect(updatePriceAndInventory).not.toHaveBeenCalled();
  });
});
