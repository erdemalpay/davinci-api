import { of, throwError } from 'rxjs';
import {
  IntegrationRequestStatus,
  IntegrationSource,
} from '../integration-request-log/integration-request-log.schema';
import { IdefixClient } from './idefix.client';

const KEY = 'key-1';
const SECRET = 'top-secret';
const TOKEN = Buffer.from(`${KEY}:${SECRET}`).toString('base64');

function buildClient(
  httpBehaviour: { ok?: any; status?: number; error?: any },
  env: Record<string, string> = {},
) {
  const http = {
    request: jest.fn<any, any[]>(() =>
      httpBehaviour.error
        ? throwError(() => httpBehaviour.error)
        : of({ data: httpBehaviour.ok, status: httpBehaviour.status ?? 200 }),
    ),
  };
  const create = jest.fn<Promise<void>, any[]>(async () => undefined);
  const values: Record<string, string> = {
    IDEFIX_TOKEN: KEY,
    IDEFIX_SECRET: SECRET,
    ...env,
  };
  const configService = { get: jest.fn((k: string) => values[k]) };
  const client = new IdefixClient(
    configService as never,
    http as never,
    { create } as never,
  );
  const logger = (client as any).logger;
  for (const level of ['log', 'debug', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }
  return { client, http, create };
}

const originalEnv = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

describe('IdefixClient.request', () => {
  it('X-API-KEY = base64(key:secret) gönderir ve başarılı cevabı loglar', async () => {
    const { client, http, create } = buildClient({ ok: { id: 1 } });

    const data = await client.request('POST', '/pim/x', { body: { a: 1 } });

    expect(data).toEqual({ id: 1 });
    const config = http.request.mock.calls[0][0];
    expect(config.url).toBe('https://merchantapi.idefix.com/pim/x');
    expect(config.headers['X-API-KEY']).toBe(TOKEN);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: IntegrationSource.IDEFIX,
        method: 'POST',
        endpoint: '/pim/x',
        requestBody: { a: 1 },
        status: IntegrationRequestStatus.SUCCESS,
        statusCode: 200,
      }),
    );
    const logged = JSON.stringify(create.mock.calls);
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain(TOKEN);
  });

  it('skipSuccessLog true dönerse başarılı cevap loglanmaz', async () => {
    const { client, create } = buildClient({ ok: { items: [] } });

    await client.request('GET', '/oms/1/list', {
      skipSuccessLog: (d: any) => d.items.length === 0,
    });

    expect(create).not.toHaveBeenCalled();
  });

  it('hatayı loglar ve aynen fırlatır', async () => {
    const error = {
      message: 'boom',
      response: { status: 401, data: { message: 'VENDOR_TOKEN_NOT_EXIST' } },
    };
    const { client, create } = buildClient({ error });

    await expect(client.request('GET', '/x')).rejects.toBe(error);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: IntegrationRequestStatus.ERROR,
        statusCode: 401,
        errorMessage: 'VENDOR_TOKEN_NOT_EXIST',
      }),
    );
  });

  it('log yazılamazsa asıl istek bozulmaz', async () => {
    const { client, create } = buildClient({ ok: { id: 1 } });
    create.mockRejectedValueOnce(new Error('mongo down'));

    await expect(client.request('GET', '/x')).resolves.toEqual({ id: 1 });
  });
});

describe('IdefixClient yazma koruması', () => {
  it('production dışında yazma kapalı', () => {
    process.env.NODE_ENV = 'staging';
    const { client } = buildClient({});
    expect(client.writesEnabled).toBe(false);
    expect(() => client.assertWritesEnabled()).toThrow(/IDEFIX_ALLOW_WRITES/);
  });

  it('production da açık', () => {
    process.env.NODE_ENV = 'production';
    const { client } = buildClient({});
    expect(client.writesEnabled).toBe(true);
  });

  it('IDEFIX_ALLOW_WRITES=true lokalde açar', () => {
    process.env.NODE_ENV = 'development';
    const { client } = buildClient({}, { IDEFIX_ALLOW_WRITES: 'true' });
    expect(client.writesEnabled).toBe(true);
  });
});
