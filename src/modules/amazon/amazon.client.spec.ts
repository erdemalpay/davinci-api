import { Logger } from '@nestjs/common';
import { gzipSync } from 'zlib';
import { of, throwError } from 'rxjs';
import { IntegrationSource } from '../integration-request-log/integration-request-log.schema';
import { AmazonClient } from './amazon.client';

const ENV = {
  AMAZON_CLIENT_ID: 'client-1',
  AMAZON_CLIENT_SECRET: 'top-secret',
  AMAZON_REFRESH_TOKEN: 'Atzr|refresh',
};

function buildClient(
  options: {
    env?: Record<string, string>;
    tokenError?: any;
    expiresIn?: number;
  } = {},
) {
  const { env = ENV, tokenError, expiresIn = 3600 } = options;
  let tokenNumber = 0;
  const http = {
    post: jest.fn<any, any[]>(() =>
      tokenError
        ? throwError(() => tokenError)
        : of({
            data: {
              access_token: `token-${++tokenNumber}`,
              expires_in: expiresIn,
            },
          }),
    ),
    request: jest.fn<any, any[]>(() => of({ data: { ok: true }, status: 200 })),
  };
  const create = jest.fn<Promise<void>, any[]>(async () => undefined);
  const configService = { get: jest.fn((key: string) => env[key]) };
  const client = new AmazonClient(
    configService as never,
    http as never,
    { create } as never,
  );
  for (const level of ['log', 'debug', 'warn', 'error'] as const) {
    jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
  }
  return { client, http, create };
}

describe('AmazonClient.request', () => {
  it('refresh token ile access token alır ve başlıklara koyar', async () => {
    const { client, http, create } = buildClient();

    const data = await client.request('GET', '/orders/2026-01-01/orders', {
      params: { a: 1 },
    });

    expect(data).toEqual({ ok: true });
    const [tokenUrl, body] = http.post.mock.calls[0];
    expect(tokenUrl).toBe('https://api.amazon.com/auth/o2/token');
    expect(new URLSearchParams(body).get('grant_type')).toBe('refresh_token');
    expect(new URLSearchParams(body).get('refresh_token')).toBe('Atzr|refresh');
    const config = http.request.mock.calls[0][0];
    expect(config.url).toBe(
      'https://sellingpartnerapi-eu.amazon.com/orders/2026-01-01/orders',
    );
    expect(config.headers['x-amz-access-token']).toBe('token-1');
    expect(config.headers['user-agent']).toContain('davinci-be');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ source: IntegrationSource.AMAZON }),
    );
  });

  it('token süresi dolmadan yeniden istemez, dolunca yeniler', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-17T10:00:00Z'));
    const { client, http } = buildClient({ expiresIn: 3600 });

    await client.request('GET', '/a');
    await client.request('GET', '/b');
    expect(http.post).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date('2026-11-17T10:59:30Z'));
    await client.request('GET', '/c');
    expect(http.post).toHaveBeenCalledTimes(2);
    expect(http.request.mock.calls[2][0].headers['x-amz-access-token']).toBe(
      'token-2',
    );
    jest.useRealTimers();
  });

  it('aynı anda gelen isteklerde tek token isteği atar', async () => {
    const { client, http } = buildClient();

    await Promise.all([
      client.request('GET', '/a'),
      client.request('GET', '/b'),
    ]);

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.request).toHaveBeenCalledTimes(2);
  });

  it('kimlik bilgisi eksikse istek atmadan hata verir', async () => {
    const { client, http } = buildClient({ env: {} });

    await expect(client.request('GET', '/a')).rejects.toThrow(
      'Amazon credentials are not configured',
    );
    expect(http.post).not.toHaveBeenCalled();
    expect(http.request).not.toHaveBeenCalled();
  });

  it('token hatasında secret içermeyen mesaj verir', async () => {
    const { client, http } = buildClient({
      tokenError: {
        message: 'Request failed',
        config: { data: 'client_secret=top-secret' },
        response: { data: { error_description: 'Invalid refresh token' } },
      },
    });

    const error = await client.request('GET', '/a').catch((e) => e);

    expect(error.message).toBe(
      'Amazon token request failed: Invalid refresh token',
    );
    expect(JSON.stringify(error.getResponse())).not.toContain('top-secret');
    expect(http.request).not.toHaveBeenCalled();
  });
});

describe('AmazonClient.getReport', () => {
  const REPORT = 'GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA';
  const START = new Date('2026-10-18T00:00:00Z');
  const END = new Date('2026-11-17T00:00:00Z');

  function buildReportClient(
    statuses: Array<{ processingStatus: string; reportDocumentId?: string }>,
    document: { compression?: 'GZIP'; content: string } = { content: 'x' },
  ) {
    let poll = 0;
    const requests: Array<{ method: string; url: string; data?: any }> = [];
    const http = {
      post: jest.fn<any, any[]>(() =>
        of({ data: { access_token: 't', expires_in: 3600 } }),
      ),
      request: jest.fn<any, any[]>((config) => {
        requests.push({
          method: config.method,
          url: config.url,
          data: config.data,
        });
        if (config.method === 'POST') {
          return of({ data: { reportId: 'r1' }, status: 202 });
        }
        if (config.url.includes('/documents/')) {
          return of({
            data: {
              url: 'https://s3.example/doc',
              ...(document.compression && {
                compressionAlgorithm: document.compression,
              }),
            },
            status: 200,
          });
        }
        return of({
          data: {
            reportId: 'r1',
            ...statuses[Math.min(poll++, statuses.length - 1)],
          },
          status: 200,
        });
      }),
      get: jest.fn<any, any[]>(() => {
        const raw = Buffer.from(document.content, 'utf-8');
        const body = document.compression ? gzipSync(raw) : raw;
        return of({
          data: body.buffer.slice(
            body.byteOffset,
            body.byteOffset + body.byteLength,
          ),
        });
      }),
    };
    const configService = {
      get: jest.fn((key: string) => ENV[key as keyof typeof ENV]),
    };
    const client = new AmazonClient(
      configService as never,
      http as never,
      { create: async () => undefined } as never,
    );
    return { client, http, requests };
  }

  beforeEach(() => {
    // Bekleme süreleri testte atlanır.
    jest.spyOn(global, 'setTimeout').mockImplementation(((
      callback: () => void,
    ) => {
      callback();
      return 0;
    }) as never);
    for (const level of ['log', 'debug', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('raporu ister, hazır olunca indirip metin olarak döner', async () => {
    const { client, requests, http } = buildReportClient(
      [{ processingStatus: 'DONE', reportDocumentId: 'd1' }],
      { content: 'a\tb\n1\t2' },
    );

    const text = await client.getReport(REPORT, START, END);

    expect(text).toBe('a\tb\n1\t2');
    expect(requests[0]).toMatchObject({
      method: 'POST',
      url: 'https://sellingpartnerapi-eu.amazon.com/reports/2021-06-30/reports',
      data: {
        reportType: REPORT,
        marketplaceIds: ['A33AVAJ2PDY3EV'],
        dataStartTime: START.toISOString(),
        dataEndTime: END.toISOString(),
      },
    });
    // Önceden imzalı adrese Amazon kimlik başlıkları gönderilmez.
    expect(http.get.mock.calls[0][0]).toBe('https://s3.example/doc');
    expect(http.get.mock.calls[0][1].headers).toBeUndefined();
  });

  it('GZIP sıkıştırılmış raporu açar', async () => {
    const { client } = buildReportClient(
      [{ processingStatus: 'DONE', reportDocumentId: 'd1' }],
      { compression: 'GZIP', content: 'sıkıştırılmış' },
    );

    expect(await client.getReport(REPORT, START, END)).toBe('sıkıştırılmış');
  });

  it('hazır değilse bekleyip yeniden sorar', async () => {
    const { client, requests } = buildReportClient([
      { processingStatus: 'IN_QUEUE' },
      { processingStatus: 'IN_PROGRESS' },
      { processingStatus: 'DONE', reportDocumentId: 'd1' },
    ]);

    expect(await client.getReport(REPORT, START, END)).toBe('x');
    expect(requests.filter((r) => r.url.endsWith('/reports/r1'))).toHaveLength(
      3,
    );
  });

  it('Amazon raporu iptal ederse (veri yok) boş metin döner', async () => {
    const { client } = buildReportClient([{ processingStatus: 'CANCELLED' }]);

    expect(await client.getReport(REPORT, START, END)).toBe('');
  });

  it('rapor hata verirse (FATAL) hata fırlatır', async () => {
    const { client } = buildReportClient([{ processingStatus: 'FATAL' }]);

    await expect(client.getReport(REPORT, START, END)).rejects.toThrow(
      `Amazon report ${REPORT} failed`,
    );
  });

  it('rapor hiç hazır olmazsa zaman aşımına düşer', async () => {
    const { client } = buildReportClient([{ processingStatus: 'IN_PROGRESS' }]);

    await expect(client.getReport(REPORT, START, END)).rejects.toThrow(
      'timed out',
    );
  });
});
