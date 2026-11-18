jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { AmazonService } from './amazon.service';

const summary = (sellerSku: string, asin: string, quantity: number) => ({
  sellerSku,
  asin,
  productName: sellerSku,
  totalQuantity: quantity,
  inventoryDetails: { fulfillableQuantity: quantity },
});

function buildService(
  options: {
    menuItems?: any[];
    summaries?: any[][];
    eans?: Record<string, string>;
  } = {},
) {
  const { menuItems = [], summaries = [[]], eans = {} } = options;
  let page = 0;
  const amazonClient = {
    request: jest.fn<Promise<any>, any[]>(async (_m, path) => {
      if (path.startsWith('/fba/')) {
        const current = summaries[page] ?? [];
        const hasNext = page < summaries.length - 1;
        page++;
        return {
          payload: { inventorySummaries: current },
          pagination: hasNext ? { nextToken: `t${page}` } : undefined,
        };
      }
      return {
        items: Object.entries(eans).map(([asin, ean]) => ({
          asin,
          identifiers: [
            {
              identifiers: [
                { identifierType: 'UPC', identifier: '999' },
                { identifierType: 'EAN', identifier: ean },
              ],
            },
          ],
        })),
      };
    }),
  };
  const menuService = {
    findAllItems: jest.fn(async () => menuItems),
    updateItemField: jest.fn(async () => ({})),
  };
  const websocketGateway = { emitItemChanged: jest.fn(async () => undefined) };
  const service = new AmazonService(
    amazonClient as never,
    menuService as never,
    websocketGateway as never,
  );
  return { service, amazonClient, menuService, websocketGateway };
}

describe('AmazonService.getAllProducts', () => {
  it('stoğu olan ürünleri sayfalarla toplar ve EAN ekler', async () => {
    const { service } = buildService({
      summaries: [
        [summary('A', 'ASIN1', 5), summary('B', 'ASIN2', 0)],
        [summary('C', 'ASIN3', 2)],
      ],
      eans: { ASIN1: '111', ASIN3: '333' },
    });

    const products = await service.getAllProducts();

    expect(products.map((p) => [p.sellerSku, p.barcode, p.quantity])).toEqual([
      ['A', '111', 5],
      ['C', '333', 2],
    ]);
  });

  it("EAN'ı olmayan ürünün barkodu null olur", async () => {
    const { service } = buildService({
      summaries: [[summary('A', 'ASIN1', 5)]],
    });

    expect((await service.getAllProducts())[0].barcode).toBeNull();
  });

  it("ASIN'leri 20'şerli gruplarla sorar", async () => {
    const many = Array.from({ length: 45 }, (_, i) =>
      summary(`S${i}`, `ASIN${i}`, 1),
    );
    const { service, amazonClient } = buildService({ summaries: [many] });

    await service.getAllProducts();

    const catalogCalls = amazonClient.request.mock.calls.filter(([, path]) =>
      path.startsWith('/catalog/'),
    );
    expect(catalogCalls).toHaveLength(3);
    // Sayfa boyutu verilmezse Amazon 10 sonuç döner ve geri kalan ürünlerin EAN'ı kaybolur.
    expect(
      catalogCalls.every(([, , opts]) => opts.params.pageSize === 20),
    ).toBe(true);
  });
});

describe('AmazonService.matchItemsByBarcode', () => {
  const fba = {
    summaries: [[summary('SKU-1', 'ASIN1', 5)]],
    eans: { ASIN1: '8684917956944' },
  };

  it('barkodu EAN ile eşleşen ürüne amazonSku yazar', async () => {
    const { service, menuService } = buildService({
      ...fba,
      menuItems: [{ _id: 10, name: 'Flip7', barcode: '8684917956944' }],
    });

    const result = await service.matchItemsByBarcode([10]);

    expect(result).toMatchObject({ total: 1, matched: 1 });
    expect(menuService.updateItemField).toHaveBeenCalledWith(10, {
      amazonSku: 'SKU-1',
    });
  });

  it('eşleşme olunca menü önbelleğini temizleyip panele haber verir', async () => {
    const { service, websocketGateway } = buildService({
      ...fba,
      menuItems: [{ _id: 10, name: 'Flip7', barcode: '8684917956944' }],
    });

    await service.matchItemsByBarcode([10]);

    expect(websocketGateway.emitItemChanged).toHaveBeenCalledTimes(1);
  });

  it('hiç eşleşme yoksa panele haber vermez', async () => {
    const { service, websocketGateway } = buildService({
      ...fba,
      menuItems: [{ _id: 11, name: 'B', barcode: '000' }],
    });

    await service.matchItemsByBarcode([11]);

    expect(websocketGateway.emitItemChanged).not.toHaveBeenCalled();
  });

  it('barkodu olmayan ve bulunamayan ürünü ayrı sayar', async () => {
    const { service, menuService } = buildService({
      ...fba,
      menuItems: [
        { _id: 10, name: 'A' },
        { _id: 11, name: 'B', barcode: '000' },
      ],
    });

    const result = await service.matchItemsByBarcode([10, 11]);

    expect(result).toMatchObject({ noBarcode: 1, notFound: 1, matched: 0 });
    expect(menuService.updateItemField).not.toHaveBeenCalled();
  });

  it('SKU başka menü ürününe bağlıysa eşleştirmez', async () => {
    const { service, menuService } = buildService({
      ...fba,
      menuItems: [
        { _id: 10, name: 'Flip7', barcode: '8684917956944' },
        {
          _id: 20,
          name: 'Flip7 Hasarlı',
          barcode: '8684917956944',
          amazonSku: 'SKU-1',
        },
      ],
    });

    const result = await service.matchItemsByBarcode([10]);

    expect(result.results[0]).toMatchObject({
      status: 'already_matched',
      matchedItemId: 20,
    });
    expect(menuService.updateItemField).not.toHaveBeenCalled();
  });

  it('aynı barkodlu kopyalarda seçim sırası ne olursa olsun küçük id kazanır', async () => {
    const { service, menuService } = buildService({
      ...fba,
      menuItems: [
        { _id: 20, name: 'Flip7 Hasarlı', barcode: '8684917956944' },
        { _id: 10, name: 'Flip7', barcode: '8684917956944' },
      ],
    });

    const result = await service.matchItemsByBarcode([20, 10]);

    expect(menuService.updateItemField).toHaveBeenCalledTimes(1);
    expect(menuService.updateItemField).toHaveBeenCalledWith(10, {
      amazonSku: 'SKU-1',
    });
    expect(result).toMatchObject({ matched: 1, alreadyMatched: 1 });
  });

  it('silinmiş ürünün SKU sahipliği engellemez', async () => {
    const { service } = buildService({
      ...fba,
      menuItems: [
        { _id: 10, name: 'Flip7', barcode: '8684917956944' },
        { _id: 20, name: 'Eski', amazonSku: 'SKU-1', deleted: true },
      ],
    });

    expect(await service.matchItemsByBarcode([10])).toMatchObject({
      matched: 1,
    });
  });
});
