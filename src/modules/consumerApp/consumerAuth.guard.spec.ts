import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConsumerStatus } from '../consumer/consumer.schema';
import { ConsumerAuthGuard } from './consumerAuth.guard';

function build({
  verify = jest.fn().mockReturnValue({ type: 'consumer', consumer: 7 }),
  findById = jest
    .fn()
    .mockResolvedValue({ _id: 7, status: ConsumerStatus.ACTIVE }),
} = {}) {
  const guard = new ConsumerAuthGuard(
    { verify } as never,
    { get: () => 'secret' } as never,
    { findById } as never,
  );
  return { guard, verify, findById };
}

const contextWith = (authorization?: string) => {
  const request: { headers: object; consumer?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
};

describe('ConsumerAuthGuard', () => {
  it('müşteri token’ıyla müşteriyi isteğe koyar', async () => {
    const { guard } = build();
    const { context, request } = contextWith('Bearer token');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.consumer).toEqual({ _id: 7, status: ConsumerStatus.ACTIVE });
  });

  it('token yoksa 401 verir', async () => {
    const { guard } = build();
    await expect(guard.canActivate(contextWith().context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('personel token’ını reddeder', async () => {
    const { guard, findById } = build({
      verify: jest.fn().mockReturnValue({ username: 'ali' }),
    });
    await expect(
      guard.canActivate(contextWith('Bearer staff').context),
    ).rejects.toThrow(UnauthorizedException);
    expect(findById).not.toHaveBeenCalled();
  });

  it('pasif müşteriyi reddeder', async () => {
    const { guard } = build({
      findById: jest
        .fn()
        .mockResolvedValue({ _id: 7, status: ConsumerStatus.INACTIVE }),
    });
    await expect(
      guard.canActivate(contextWith('Bearer token').context),
    ).rejects.toThrow(UnauthorizedException);
  });

  // Uygulama 401'de oturumu kapatır; veritabanı hatası kapatmamalı.
  it('veritabanı hatasında 503 verir', async () => {
    const { guard } = build({
      findById: jest.fn().mockRejectedValue(new Error('timeout')),
    });
    await expect(
      guard.canActivate(contextWith('Bearer token').context),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
