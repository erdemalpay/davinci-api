jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { defer, of, throwError } from 'rxjs';
import { IntegrationRequestStatus } from '../integration-request-log/integration-request-log.schema';
import { TrendyolService } from './trendyol.service';

const BASE_URL = 'https://example.test';

/** Servisi sahte bağımlılıklarla kurar ve logger çıktısını susturur. */
function createService(configService: any, http: any, create: jest.Mock) {
  const service = new TrendyolService(
    configService as never,
    http as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { create } as never,
  );

  const logger = (service as any).logger;
  for (const level of ['log', 'debug', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }

  return { service, logger };
}

/**
 * TrendyolService'i sadece request() helper'ini sinamak icin kurar.
 * Projedeki diger spec'ler gibi NestJS test modulu kurmadan, dogrudan new ile.
 */
function buildService(
  httpBehaviour: { ok?: any; status?: number; error?: any },
  logBehaviour: { throws?: boolean } = {},
) {
  const http = {
    request: jest.fn((_config: any) =>
      httpBehaviour.error
        ? throwError(() => httpBehaviour.error)
        : of({ data: httpBehaviour.ok, status: httpBehaviour.status ?? 200 }),
    ),
  };

  const create = jest.fn(async (_data: any) => {
    if (logBehaviour.throws) {
      throw new Error('mongo down');
    }
  });

  const configService = { get: jest.fn(() => BASE_URL) };

  const { service, logger } = createService(configService, http, create);

  const call = (method: any, path: string, options?: any) =>
    (service as any).request(method, path, options);

  return { service, http, create, call, logger };
}

describe('TrendyolService.request', () => {
  it('basarili cagriyi success olarak loglar ve cevabi doner', async () => {
    const { call, create, http } = buildService({
      ok: { batchRequestId: 'abc' },
      status: 200,
    });

    const data = await call('POST', '/integration/x', {
      body: { items: [1] },
      sendsJson: true,
    });

    expect(data).toEqual({ batchRequestId: 'abc' });

    // baseUrl helper icinde ekleniyor, auth ve header'lar tek noktada
    const sent = http.request.mock.calls[0][0];
    expect(sent.url).toBe(`${BASE_URL}/integration/x`);
    expect(sent.headers['Content-Type']).toBe('application/json');
    expect(sent.auth).toBeDefined();

    const logged = create.mock.calls[0][0];
    expect(logged.status).toBe(IntegrationRequestStatus.SUCCESS);
    expect(logged.statusCode).toBe(200);
    expect(logged.endpoint).toBe('/integration/x');
    expect(logged.method).toBe('POST');
    expect(typeof logged.durationMs).toBe('number');
  });

  it('HTTP hatasinda error loglar ve ORIJINAL hatayi yeniden firlatir', async () => {
    const axiosError: any = new Error('Request failed');
    axiosError.response = {
      status: 400,
      data: { message: 'Barcode not found' },
    };
    const { call, create } = buildService({ error: axiosError });

    // Cagiran taraflar error?.response?.data okuyor; sarmalarsak bozulur.
    await expect(call('GET', '/integration/z')).rejects.toBe(axiosError);

    const logged = create.mock.calls[0][0];
    expect(logged.status).toBe(IntegrationRequestStatus.ERROR);
    expect(logged.statusCode).toBe(400);
    expect(logged.errorMessage).toBe('Barcode not found');
    expect(logged.responseBody).toEqual({ message: 'Barcode not found' });
  });

  it('cevapsiz baglanti hatasinda statusCode BOS kalir, uydurma kod yazilmaz', async () => {
    const connectionError: any = new Error('connect ECONNREFUSED');
    const { call, create } = buildService({ error: connectionError });

    await expect(call('GET', '/integration/z')).rejects.toBe(connectionError);

    const logged = create.mock.calls[0][0];
    expect(logged.statusCode).toBeUndefined();
    expect(logged.errorMessage).toBe('connect ECONNREFUSED');
  });

  it('hassas alanlari maskeler ama Trendyol\'a giden govdeyi degistirmez', async () => {
    const { call, create, http } = buildService({
      ok: { id: 'wh_1', username: 'davinci', url: 'https://hook.test' },
    });

    const body = {
      url: 'https://hook.test',
      username: 'davinci',
      password: 'S3cr3t!',
      apiKey: 'abc123',
      nested: [{ apiSecret: 'xyz', keep: 'visible' }],
    };

    await call('POST', '/integration/webhook/sellers/1/webhooks', {
      body,
      sendsJson: true,
    });

    // Giden govde aynen korunur
    expect(http.request.mock.calls[0][0].data).toBe(body);
    expect(body.password).toBe('S3cr3t!');

    // Loglanan kopya maskeli
    const logged = create.mock.calls[0][0].requestBody;
    expect(logged.password).toBe('***');
    expect(logged.apiKey).toBe('***');
    expect(logged.username).toBe('***');
    expect(logged.nested[0].apiSecret).toBe('***');
    expect(logged.nested[0].keep).toBe('visible');
    expect(logged.url).toBe('https://hook.test');

    // Cevap tarafi da maskelenmeli: getWebhooks cevabinda username donuyor
    const loggedResponse = create.mock.calls[0][0].responseBody;
    expect(loggedResponse.username).toBe('***');
    expect(loggedResponse.id).toBe('wh_1');
  });

  it('urun listesi cevabini ozetler, 200 urunun icerigini saklamaz', async () => {
    const content = Array.from({ length: 200 }, (_, i) => ({
      id: `p${i}`,
      description: 'x'.repeat(1500),
    }));
    const { call, create } = buildService({
      ok: { totalElements: 489, totalPages: 3, page: 0, size: 200, content },
    });

    await call('GET', '/integration/product/sellers/1/products', {
      params: { page: 0, size: 200 },
    });

    const logged = create.mock.calls[0][0].responseBody;
    expect(logged).toEqual({
      __summary: true,
      totalElements: 489,
      totalPages: 3,
      page: 0,
      size: 200,
      contentCount: 200,
    });
    expect(logged.content).toBeUndefined();
  });

  it('ozetlenmeyen buyuk cevabi kirpar ve kirpildigini belli eder', async () => {
    const { call, create } = buildService({
      ok: { rows: Array.from({ length: 4000 }, (_, i) => ({ i, pad: 'y'.repeat(40) })) },
    });

    await call('GET', '/integration/order/sellers/1/orders', { params: { page: 0 } });

    const logged = create.mock.calls[0][0].responseBody;
    expect(logged.__truncated).toBe(true);
    expect(logged.originalBytes).toBeGreaterThan(100 * 1024);
    expect(typeof logged.preview).toBe('string');
  });

  it('errorMessage object gelse bile string yazilir', async () => {
    // String alanina object yazilirsa Mongoose CastError firlatir ve kayit kaybolur
    const axiosError: any = new Error('Request failed');
    axiosError.response = {
      status: 500,
      data: { error: { code: 'TY-500', description: 'internal' } },
    };
    const { call, create } = buildService({ error: axiosError });

    await expect(call('GET', '/integration/z')).rejects.toBe(axiosError);

    const logged = create.mock.calls[0][0];
    expect(typeof logged.errorMessage).toBe('string');
    expect(logged.errorMessage).toBe('{"code":"TY-500","description":"internal"}');
  });

  it('log yazilamazsa asil istek BOZULMAZ, sadece uyari dusulur', async () => {
    const { call, logger } = buildService({ ok: { fine: true } }, { throws: true });

    await expect(call('GET', '/integration/z')).resolves.toEqual({
      fine: true,
    });
    expect(logger.warn).toHaveBeenCalled();
  });

});

const SELLER_ID = '924232';
const INVENTORY_LIST_PATH = `/integration/product/sellers/${SELLER_ID}/products/approved/inventory-and-price`;
const INVENTORY_LIST_URL = `${BASE_URL}${INVENTORY_LIST_PATH}`;
const PRICE_AND_INVENTORY_URL = `${BASE_URL}/integration/inventory/sellers/${SELLER_ID}/products/price-and-inventory`;

/** axios'un fırlattığı hataya benzeyen nesne. */
function httpError(status: number, data: any = { message: 'boom' }) {
  const error: any = new Error(`Request failed with status code ${status}`);
  error.response = { status, data, headers: {} };
  return error;
}

function variant(overrides: Partial<Record<string, any>> = {}) {
  return {
    variantId: 1,
    barcode: 'B1',
    salePrice: 1750,
    listPrice: 1750,
    quantity: 9,
    stockCode: 'S1',
    ...overrides,
  };
}

function inventoryPage(variants: any[], extra: Record<string, any> = {}) {
  return {
    totalElements: variants.length,
    totalPages: 1,
    page: 0,
    size: 100,
    content: variants.length
      ? [{ contentId: 1, productMainId: 'PM1', variants }]
      : [],
    ...extra,
  };
}

/**
 * TrendyolService'i, HTTP katmanı taklit edilerek kurar. handler her istek için
 * veri döner ya da hata fırlatır; böylece gerçek Trendyol çağrısı yapılmaz.
 */
function buildRoutedService(handler: (config: any) => any) {
  const http = {
    request: jest.fn((config: any) =>
      defer(async () => ({ data: await handler(config), status: 200 })),
    ),
  };

  const configService = {
    get: jest.fn((key: string) => {
      if (key.includes('BASE_URL')) return BASE_URL;
      if (key.includes('SELLER_ID')) return SELLER_ID;
      return 'secret';
    }),
  };

  const create = jest.fn().mockResolvedValue(undefined);

  const { service, logger } = createService(configService, http, create);

  const calls = (method: string, url: string) =>
    http.request.mock.calls
      .map(([config]) => config)
      .filter((config: any) => config.method === method && config.url === url);

  return { service, http, create, logger, calls };
}

/** Standart yönlendirme: liste çağrıları katalog döner, POST batch id döner. */
function routes(overrides: {
  list?: (config: any) => any;
  post?: (config: any) => any;
}) {
  return (config: any) => {
    if (config.method === 'GET' && config.url === INVENTORY_LIST_URL) {
      return overrides.list
        ? overrides.list(config)
        : inventoryPage([variant()]);
    }
    if (config.method === 'POST' && config.url === PRICE_AND_INVENTORY_URL) {
      return overrides.post
        ? overrides.post(config)
        : { batchRequestId: 'BATCH1' };
    }
    throw new Error(`beklenmeyen istek: ${config.method} ${config.url}`);
  };
}

describe('TrendyolService.getAllProductsComplete (Product V2)', () => {
  it('V2 stok-fiyat ucundan 100luk sayfalarla ceker ve varyantlari duzlestirir', async () => {
    const { service, calls } = buildRoutedService(
      routes({
        list: (config) =>
          config.params.page === 0
            ? {
                totalElements: 3,
                totalPages: 2,
                page: 0,
                size: 100,
                content: [
                  {
                    contentId: 1,
                    productMainId: 'PM1',
                    variants: [
                      variant({ variantId: 1, barcode: 'B1' }),
                      variant({ variantId: 2, barcode: 'B2' }),
                    ],
                  },
                ],
              }
            : {
                totalElements: 3,
                totalPages: 2,
                page: 1,
                size: 100,
                content: [
                  {
                    contentId: 2,
                    productMainId: 'PM2',
                    variants: [variant({ variantId: 3, barcode: 'B3' })],
                  },
                ],
              },
      }),
    );

    const products = await service.getAllProductsComplete();

    const gets = calls('GET', INVENTORY_LIST_URL);
    expect(gets.map((c: any) => c.params.page)).toEqual([0, 1]);
    expect(gets.every((c: any) => c.params.size === 100)).toBe(true);
    expect(products.map((p) => [p.barcode, p.productMainId])).toEqual([
      ['B1', 'PM1'],
      ['B2', 'PM1'],
      ['B3', 'PM2'],
    ]);
  });

  it('10.000 urunu asan katalogda sessizce kirpmak yerine hata firlatir', async () => {
    const { service } = buildRoutedService(
      routes({
        list: () => inventoryPage([variant()], { totalElements: 10001 }),
      }),
    );

    await expect(service.getAllProductsComplete()).rejects.toThrow(/10000/);
  });
});

describe('TrendyolService.updateProductStock (eski davranis, V2 listeleme)', () => {
  it('katalogu V2den cekip barkodla eslestirir ve yeni stogu gonderir', async () => {
    const { service, calls } = buildRoutedService(
      routes({
        list: () =>
          inventoryPage([
            variant({ variantId: 2, barcode: 'BASKA', quantity: 3 }),
            variant({ variantId: 1, barcode: 'B1', quantity: 9 }),
          ]),
      }),
    );

    expect(await service.updateProductStock('B1', 6, 0)).toBe(true);

    const [post] = calls('POST', PRICE_AND_INVENTORY_URL);
    expect(post.data).toEqual({
      items: [{ barcode: 'B1', quantity: 0, salePrice: 1750, listPrice: 1750 }],
    });
  });

  it('menudeki deger productMainId ise onunla da eslestirir', async () => {
    const { service, calls } = buildRoutedService(
      routes({ list: () => inventoryPage([variant({ barcode: 'GERCEK' })]) }),
    );

    await service.updateProductStock('PM1', 6, 3);

    expect(
      calls('POST', PRICE_AND_INVENTORY_URL)[0].data.items[0].barcode,
    ).toBe('GERCEK');
  });

  it('stok zaten ayniysa POST atmaz', async () => {
    const { service, calls } = buildRoutedService(
      routes({ list: () => inventoryPage([variant({ quantity: 4 })]) }),
    );

    expect(await service.updateProductStock('B1', 6, 4)).toBe(true);
    expect(calls('POST', PRICE_AND_INVENTORY_URL)).toHaveLength(0);
  });

  it('sadece Online Store (6) icin calisir', async () => {
    const { service, http } = buildRoutedService(routes({}));

    expect(await service.updateProductStock('B1', 2, 5)).toBe(false);
    expect(http.request).not.toHaveBeenCalled();
  });

  it('Trendyol da urun yoksa false doner, POST atmaz', async () => {
    const { service, calls } = buildRoutedService(
      routes({ list: () => inventoryPage([variant({ barcode: 'BASKA' })]) }),
    );

    expect(await service.updateProductStock('YOK', 6, 1)).toBe(false);
    expect(calls('POST', PRICE_AND_INVENTORY_URL)).toHaveLength(0);
  });

  it('listeleme hatasi ana akisi bozmaz: firlatmaz, false doner', async () => {
    const { service } = buildRoutedService(
      routes({
        list: () => {
          throw httpError(426);
        },
      }),
    );

    await expect(service.updateProductStock('B1', 6, 0)).resolves.toBe(false);
  });
});

describe('TrendyolService hata/cevap loglama', () => {
  it('liste ucunda hata govdesi ozetlenmez, oldugu gibi saklanir', async () => {
    const errorBody = { message: 'Upgrade Required', hint: 'use v2' };
    const { service, create } = buildRoutedService(
      routes({
        list: () => {
          throw httpError(426, errorBody);
        },
      }),
    );

    await expect(
      (service as any).request('GET', INVENTORY_LIST_PATH),
    ).rejects.toBeDefined();

    const logged = create.mock.calls[0][0];
    expect(logged.status).toBe(IntegrationRequestStatus.ERROR);
    expect(logged.statusCode).toBe(426);
    expect(logged.responseBody).toEqual(errorBody);
  });

  it('basarili liste cevabi buyuk oldugu icin ozetlenir', async () => {
    const { service, create } = buildRoutedService(
      routes({ list: () => inventoryPage([variant()]) }),
    );

    await (service as any).request('GET', INVENTORY_LIST_PATH);

    expect(create.mock.calls[0][0].responseBody).toEqual(
      expect.objectContaining({ __summary: true, totalElements: 1 }),
    );
  });

  it('sunucu loguna durum kodu ve hata govdesini yazar, kimlik bilgisi yazmaz', async () => {
    const { service, logger } = buildRoutedService(
      routes({
        list: () => {
          throw httpError(426, { message: 'Upgrade Required' });
        },
      }),
    );

    await expect(service.getAllProducts({})).rejects.toBeDefined();

    const written = (logger.error as jest.Mock).mock.calls
      .map((args) => args.join(' '))
      .join('\n');
    expect(written).toContain('status=426');
    expect(written).toContain('Upgrade Required');
    expect(written).not.toContain('secret');
  });

  it('sunucu logunda Upgrade basligini yazar ve uzun govdeyi kirpar', async () => {
    const error = httpError(426, 'x'.repeat(5000));
    error.response.headers = { upgrade: 'TLS/1.2' };
    const { service, logger } = buildRoutedService(
      routes({
        list: () => {
          throw error;
        },
      }),
    );

    await expect(service.getAllProducts({})).rejects.toBeDefined();

    const written = (logger.error as jest.Mock).mock.calls
      .map((args) => args.join(' '))
      .join('\n');
    expect(written).toContain('upgrade=TLS/1.2');
    expect(written.length).toBeLessThan(900);
  });

  it('cevapsiz baglanti hatasinda sunucu loguna hata mesajini yazar', async () => {
    const { service, logger } = buildRoutedService(
      routes({
        list: () => {
          throw new Error('connect ECONNREFUSED');
        },
      }),
    );

    await expect(service.getAllProducts({})).rejects.toBeDefined();

    expect((logger.error as jest.Mock).mock.calls.flat().join(' ')).toContain(
      'connect ECONNREFUSED',
    );
  });
});
