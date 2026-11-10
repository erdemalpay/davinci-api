jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HepsiburadaWebhookController } from './hepsiburada-webhook.controller';
import { HepsiburadaWebhookGuard } from './hepsiburada-webhook.guard';
import { HepsiburadaController } from './hepsiburada.controller';

describe('HepsiburadaWebhookGuard', () => {
  const username = 'davinci';
  const password = 'pass:with:colons';
  const basic = (user: string, pass: string) =>
    `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

  function guardWith(config: Record<string, string>) {
    const configService = {
      get: jest.fn((key: string) => config[key]),
    } as unknown as ConfigService;
    const guard = new HepsiburadaWebhookGuard(configService);
    const warn = jest
      .spyOn(guard['logger'], 'warn')
      .mockImplementation(() => undefined);
    return { guard, warn };
  }

  function contextWith(headers: Record<string, string>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers, method: 'POST', path: '/orders' }),
      }),
    } as unknown as ExecutionContext;
  }

  describe('when enforced', () => {
    const enforced = {
      HEPSIBURADA_STAGING_WEBHOOK_USERNAME: username,
      HEPSIBURADA_STAGING_WEBHOOK_PASSWORD: password,
      HEPSIBURADA_WEBHOOK_ENFORCE: 'true',
    };

    it('allows a request carrying the configured basic credentials', () => {
      const { guard, warn } = guardWith(enforced);
      const context = contextWith({ authorization: basic(username, password) });

      expect(guard.canActivate(context)).toBe(true);
      expect(warn).not.toHaveBeenCalled();
    });

    it('rejects a request without an authorization header', () => {
      const { guard } = guardWith(enforced);

      expect(() => guard.canActivate(contextWith({}))).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a request that is not basic auth', () => {
      const { guard } = guardWith(enforced);
      const context = contextWith({ authorization: 'Bearer some-token' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('rejects a wrong password', () => {
      const { guard } = guardWith(enforced);
      const context = contextWith({ authorization: basic(username, 'wrong') });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('rejects a wrong username', () => {
      const { guard } = guardWith(enforced);
      const context = contextWith({ authorization: basic('other', password) });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('never accepts a request when no credentials are configured', () => {
      const { guard } = guardWith({ HEPSIBURADA_WEBHOOK_ENFORCE: 'true' });
      const context = contextWith({ authorization: basic('', '') });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('rejection reason', () => {
    const reasonFor = (
      config: Record<string, string>,
      headers: Record<string, string>,
    ) => guardWith(config).guard['rejectionReason'](headers);
    const configured = {
      HEPSIBURADA_STAGING_WEBHOOK_USERNAME: username,
      HEPSIBURADA_STAGING_WEBHOOK_PASSWORD: password,
    };

    it('says the credentials do not match, without the credentials', () => {
      const header = basic('leaked-user', 'leaked-pass');
      const reason = reasonFor(configured, { authorization: header });

      expect(reason).toContain('basic credentials do not match');
      expect(reason).not.toContain('leaked');
      expect(reason).not.toContain(header.split(' ')[1]);
    });

    it('says when no credentials are configured', () => {
      expect(reasonFor({}, {})).toBe('no credentials configured');
    });
  });

  describe('names the known settings unverified credentials match', () => {
    const settings = {
      HEPSIBURADA_STAGING_WEBHOOK_USERNAME: 'staging-user',
      HEPSIBURADA_STAGING_WEBHOOK_PASSWORD: 'staging-pass',
      DEFAULT_FROM_EMAIL: 'shop@example.com',
      HEPSIBURADA_PRODUCTION_MERCHANT_ID: 'merchant-id',
      HEPSIBURADA_PRODUCTION_SECRET_KEY: 'production-secret',
    };

    it('when they are other known settings', () => {
      const { guard, warn } = guardWith(settings);

      guard.canActivate(
        contextWith({
          authorization: basic('shop@example.com', 'production-secret'),
        }),
      );

      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).toContain('username matches DEFAULT_FROM_EMAIL');
      expect(logged).toContain(
        'password matches HEPSIBURADA_PRODUCTION_SECRET_KEY',
      );
      expect(logged).not.toContain('production-secret');
    });

    it('when the password is none of them', () => {
      const { guard, warn } = guardWith(settings);

      guard.canActivate(
        contextWith({ authorization: basic('shop@example.com', 'other') }),
      );

      expect(JSON.stringify(warn.mock.calls)).toContain(
        'password matches no known setting',
      );
    });
  });

  it('reads the production credentials in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { guard } = guardWith({
        HEPSIBURADA_PRODUCTION_WEBHOOK_USERNAME: username,
        HEPSIBURADA_PRODUCTION_WEBHOOK_PASSWORD: password,
        HEPSIBURADA_STAGING_WEBHOOK_USERNAME: 'staging',
        HEPSIBURADA_STAGING_WEBHOOK_PASSWORD: 'staging',
        HEPSIBURADA_WEBHOOK_ENFORCE: 'true',
      });
      const context = contextWith({ authorization: basic(username, password) });

      expect(guard.canActivate(context)).toBe(true);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  // Hepsiburada's calls in the nginx log carry DEFAULT_FROM_EMAIL as the basic
  // auth username; the password may be the secret key we use to call them.
  it('falls back to the sender e-mail and Hepsiburada secret key', () => {
    const { guard } = guardWith({
      DEFAULT_FROM_EMAIL: username,
      HEPSIBURADA_STAGING_SECRET_KEY: password,
      HEPSIBURADA_WEBHOOK_ENFORCE: 'true',
    });
    const context = contextWith({ authorization: basic(username, password) });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('prefers the webhook credentials over the fallbacks', () => {
    const { guard } = guardWith({
      HEPSIBURADA_STAGING_WEBHOOK_USERNAME: username,
      HEPSIBURADA_STAGING_WEBHOOK_PASSWORD: password,
      DEFAULT_FROM_EMAIL: 'mail@example.com',
      HEPSIBURADA_STAGING_SECRET_KEY: 'secret-key',
      HEPSIBURADA_WEBHOOK_ENFORCE: 'true',
    });
    const context = contextWith({
      authorization: basic('mail@example.com', 'secret-key'),
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  describe('routes Hepsiburada calls', () => {
    const routeHandlers = (controller: { prototype: object }) =>
      Object.getOwnPropertyNames(controller.prototype)
        .filter((name) => name !== 'constructor')
        .map(
          (name) =>
            (controller.prototype as Record<string, unknown>)[name] as object,
        )
        .filter(
          (handler) =>
            typeof handler === 'function' &&
            Reflect.hasMetadata('path', handler),
        );
    const isGuardedWebhook = (handler: object) =>
      Reflect.getMetadata('isPublic', handler) === true &&
      (Reflect.getMetadata('__guards__', handler) ?? []).includes(
        HepsiburadaWebhookGuard,
      );

    it('guards every route of the webhook controller', () => {
      const handlers = routeHandlers(HepsiburadaWebhookController);

      expect(handlers).toHaveLength(12);
      expect(handlers.filter((handler) => !isGuardedWebhook(handler))).toEqual(
        [],
      );
    });

    it('guards the legacy order webhook', () => {
      expect(
        isGuardedWebhook(HepsiburadaController.prototype.orderWebhook),
      ).toBe(true);
    });
  });
});
