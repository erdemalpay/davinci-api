jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { of, throwError } from 'rxjs';
import { IntegrationRequestStatus } from '../integration-request-log/integration-request-log.schema';
import { TrendyolService } from './trendyol.service';

const BASE_URL = 'https://example.test';

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
