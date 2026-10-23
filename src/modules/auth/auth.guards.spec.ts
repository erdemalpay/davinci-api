import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './auth.guards';

describe('JwtAuthGuard.handleRequest', () => {
  const context = (isPublic = false) =>
    ({
      getHandler: () => (isPublic ? 'public' : 'private'),
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as never);
  const reflector = {
    get: (_key: string, handler: string) => handler === 'public',
  } as unknown as Reflector;
  const guard = new JwtAuthGuard(reflector);

  it('lets a known user in', () => {
    const user = { _id: 'ali' };
    expect(guard.handleRequest(null, user, null, context())).toBe(user);
  });

  it('is unauthorized without a valid token', () => {
    try {
      guard.handleRequest(null, false, new Error('jwt expired'), context());
      fail('expected an exception');
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.UNAUTHORIZED,
      );
    }
  });

  // The panel logs people out on a 401: a database that timed out at a busy
  // hour must not do that.
  it('is unavailable, not unauthorized, when the user could not be loaded', () => {
    jest.spyOn(guard['logger'], 'error').mockImplementation(() => undefined);
    expect(() =>
      guard.handleRequest(
        new Error('Operation users.findOne() buffering timed out'),
        false,
        null,
        context(),
      ),
    ).toThrow(ServiceUnavailableException);
  });

  it('lets public routes through without a user', () => {
    expect(guard.handleRequest(null, false, null, context(true))).toBeNull();
  });
});

describe('JwtAuthGuard.canActivate', () => {
  it("leaves the customer app's routes to ConsumerAuthGuard", () => {
    const reflector = {
      get: () => false,
      getAllAndOverride: (key: string) => key === 'consumerProtected',
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const context = {
      getHandler: () => 'handler',
      getClass: () => 'class',
    } as never;
    expect(guard.canActivate(context)).toBe(true);
  });
});
