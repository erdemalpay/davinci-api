import { of, throwError } from 'rxjs';
import {
  IntegrationRequestStatus,
  IntegrationSource,
} from '../integration-request-log/integration-request-log.schema';
import { N11Client } from './n11.client';

const SECRET = 'top-secret';

function buildClient(
  httpBehaviour: { ok?: any; status?: number; error?: any },
  env: Record<string, string> = {},
) {
  const http = {
    request: jest.fn((_config: any) =>
      httpBehaviour.error
        ? throwError(() => httpBehaviour.error)
        : of({ data: httpBehaviour.ok, status: httpBehaviour.status ?? 200 }),
    ),
  };
  const create = jest.fn(async (_data: any) => undefined);
  const values: Record<string, string> = {
    N11_APP_KEY: 'key-1',
    N11_APP_SECRET: SECRET,
    ...env,
  };
  const configService = { get: jest.fn((k: string) => values[k]) };
  const client = new N11Client(
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

describe('N11Client.request', () => {
  it('appkey/appsecret header ile gönderir ve başarılı cevabı loglar', async () => {
    const { client, http, create } = buildClient({ ok: { id: 1 } });

    const data = await client.request('POST', '/ms/x', { body: { a: 1 } });

    expect(data).toEqual({ id: 1 });
    const config = http.request.mock.calls[0][0];
    expect(config.url).toBe('https://api.n11.com/ms/x');
    expect(config.headers.appkey).toBe('key-1');
    expect(config.headers.appsecret).toBe(SECRET);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: IntegrationSource.N11,
        method: 'POST',
        endpoint: '/ms/x',
        requestBody: { a: 1 },
        status: IntegrationRequestStatus.SUCCESS,
        statusCode: 200,
      }),
    );
    expect(JSON.stringify(create.mock.calls)).not.toContain(SECRET);
  });

  it('skipSuccessLog true dönerse başarılı cevap loglanmaz', async () => {
    const { client, create } = buildClient({ ok: { content: [] } });

    await client.request('GET', '/rest/p', {
      skipSuccessLog: (d: any) => d.content.length === 0,
    });

    expect(create).not.toHaveBeenCalled();
  });

  it('hatayı loglar ve aynen fırlatır', async () => {
    const error = {
      message: 'boom',
      response: { status: 400, data: { message: 'bad sku' } },
    };
    const { client, create } = buildClient({ error });

    await expect(client.request('GET', '/x')).rejects.toBe(error);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: IntegrationRequestStatus.ERROR,
        statusCode: 400,
        errorMessage: 'bad sku',
      }),
    );
  });

  it('log yazılamazsa asıl istek bozulmaz', async () => {
    const { client, create } = buildClient({ ok: { id: 1 } });
    create.mockRejectedValueOnce(new Error('mongo down'));

    await expect(client.request('GET', '/x')).resolves.toEqual({ id: 1 });
  });
});

describe('N11Client yazma koruması', () => {
  it('production dışında yazma kapalı', () => {
    process.env.NODE_ENV = 'staging';
    const { client } = buildClient({});
    expect(client.writesEnabled).toBe(false);
    expect(() => client.assertWritesEnabled()).toThrow(/N11_ALLOW_WRITES/);
  });

  it('production da açık', () => {
    process.env.NODE_ENV = 'production';
    const { client } = buildClient({});
    expect(client.writesEnabled).toBe(true);
  });

  it('N11_ALLOW_WRITES=true lokalde açar', () => {
    process.env.NODE_ENV = 'development';
    const { client } = buildClient({}, { N11_ALLOW_WRITES: 'true' });
    expect(client.writesEnabled).toBe(true);
  });
});

describe('N11Client.soapRequest', () => {
  const okXml = `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Header/><SOAP-ENV:Body><ns3:ClaimReturnListResponse xmlns:ns3="http://www.n11.com/ws/schemas"><result><status>success</status></result><claimReturnList><claimReturn><claimReturnId>25391658</claimReturnId><orderNumber>123456789000</orderNumber><quantity>1</quantity><status>APPROVED</status></claimReturn></claimReturnList><pagingData><currentPage>0</currentPage><pageSize>20</pageSize><totalCount>1</totalCount><pageCount>1</pageCount></pagingData></ns3:ClaimReturnListResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>`;

  it('zarfı auth ile kurar, cevabı parse eder, secret loga düşmez', async () => {
    const { client, http, create } = buildClient({ ok: okXml });

    const result = await client.soapRequest(
      'ReturnService',
      'ClaimReturnList',
      '<searchData><status>APPROVED</status></searchData>',
    );

    const config = http.request.mock.calls[0][0];
    expect(config.url).toBe('https://api.n11.com/ws/ReturnService');
    expect(config.headers['Content-Type']).toContain('text/xml');
    expect(config.data).toContain('<sch:ClaimReturnListRequest>');
    expect(config.data).toContain(`<appSecret>${SECRET}</appSecret>`);
    expect(result.claimReturnList.claimReturn.claimReturnId).toBe('25391658');
    expect(result.pagingData.pageCount).toBe('1');
    expect(JSON.stringify(create.mock.calls)).not.toContain(SECRET);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/ws/ReturnService#ClaimReturnList',
      }),
    );
  });

  it('result.status failure ise hata fırlatır', async () => {
    const failXml = okXml.replace(
      '<status>success</status>',
      '<status>failure</status><errorMessage>yetkisiz</errorMessage>',
    );
    const { client } = buildClient({ ok: failXml });

    await expect(
      client.soapRequest('ReturnService', 'ClaimReturnList', ''),
    ).rejects.toThrow(/yetkisiz/);
  });
});
