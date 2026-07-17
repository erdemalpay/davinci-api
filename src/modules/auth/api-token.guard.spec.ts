import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ApiTokenGuard } from './api-token.guard';

describe('ApiTokenGuard', () => {
  const tokenConfigKey = 'RETAILER_ORDER_REQUEST_TOKEN';
  let configService: Pick<ConfigService, 'get'>;
  let reflector: {
    getAllAndOverride: jest.Mock;
  };
  let guard: ApiTokenGuard;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) =>
        key === tokenConfigKey ? 'expected-token' : undefined,
      ),
    };
    reflector = {
      getAllAndOverride: jest.fn(() => tokenConfigKey),
    };
    guard = new ApiTokenGuard(
      configService as ConfigService,
      reflector as unknown as Reflector,
    );
  });

  function contextWithHeaders(headers: Record<string, string>): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn(() => ({
        getRequest: () => ({ headers }),
      })),
    } as unknown as ExecutionContext;
  }

  it('allows a request with the configured bearer token', () => {
    const context = contextWithHeaders({
      authorization: 'Bearer expected-token',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a request with the configured x-api-token header', () => {
    const context = contextWithHeaders({
      'x-api-token': 'expected-token',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a missing token', () => {
    const context = contextWithHeaders({});

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects an incorrect token', () => {
    const context = contextWithHeaders({
      authorization: 'Bearer wrong-token',
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects when the configured server token is missing', () => {
    (configService.get as jest.Mock).mockReturnValue(undefined);
    const context = contextWithHeaders({
      authorization: 'Bearer expected-token',
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
