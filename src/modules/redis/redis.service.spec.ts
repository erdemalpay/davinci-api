import { RedisService } from './redis.service';

// tsconfig'de esModuleInterop kapalı: `import Redis from 'ioredis'` -> require('ioredis').default
jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    incrby: jest.fn(),
    expire: jest.fn(),
    on: jest.fn(),
  })),
}));
jest.mock('config', () => ({ get: () => ({ host: 'localhost', port: 6379 }) }));

describe('RedisService.increment', () => {
  const setup = (incrResult: number) => {
    const service = new RedisService({} as never);
    const client = service.getClient() as unknown as {
      incrby: jest.Mock;
      expire: jest.Mock;
    };
    client.incrby.mockResolvedValue(incrResult);
    return { service, client };
  };

  it('sets the expiry when the key is created', async () => {
    const { service, client } = setup(1);

    expect(await service.increment('k', 3600)).toBe(1);
    expect(client.incrby).toHaveBeenCalledWith('k', 1);
    expect(client.expire).toHaveBeenCalledWith('k', 3600);
  });

  it('does not reset the expiry on later increments', async () => {
    const { service, client } = setup(7);

    expect(await service.increment('k', 3600)).toBe(7);
    expect(client.expire).not.toHaveBeenCalled();
  });

  it('increments by the given amount and expires on first write', async () => {
    const { service, client } = setup(2500);

    await service.increment('spend', 86400, 2500);
    expect(client.incrby).toHaveBeenCalledWith('spend', 2500);
    expect(client.expire).toHaveBeenCalledWith('spend', 86400);
  });
});
