jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TRENDYOL_API_KEY_HEADER,
  TrendyolWebhookGuard,
} from './trendyol-webhook.guard';
import { TrendyolController } from './trendyol.controller';

describe('TrendyolWebhookGuard', () => {
  const apiKey = 'trendyol-webhook-key';

  function guardWith(config: Record<string, string>) {
    const configService = {
      get: jest.fn((key: string) => config[key]),
    } as unknown as ConfigService;
    const guard = new TrendyolWebhookGuard(configService);
    const warn = jest
      .spyOn(guard['logger'], 'warn')
      .mockImplementation(() => undefined);
    return { guard, warn };
  }

  function contextWith(headers: Record<string, string>): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          method: 'POST',
          path: '/trendy/order-status-webhook',
        }),
      }),
    } as unknown as ExecutionContext;
  }

  describe('when enforced', () => {
    const enforced = {
      TRENDYOL_STAGING_WEBHOOK_API_KEY: apiKey,
      TRENDYOL_WEBHOOK_ENFORCE: 'true',
    };

    it('allows a request carrying the configured api key', () => {
      const { guard, warn } = guardWith(enforced);
      const context = contextWith({ [TRENDYOL_API_KEY_HEADER]: apiKey });

      expect(guard.canActivate(context)).toBe(true);
      expect(warn).not.toHaveBeenCalled();
    });

    it('rejects a request without the api key header', () => {
      const { guard } = guardWith(enforced);

      expect(() => guard.canActivate(contextWith({}))).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a request carrying another api key', () => {
      const { guard } = guardWith(enforced);
      const context = contextWith({ [TRENDYOL_API_KEY_HEADER]: 'wrong-key' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('never accepts a request when no api key is configured', () => {
      const { guard } = guardWith({ TRENDYOL_WEBHOOK_ENFORCE: 'true' });
      const context = contextWith({ [TRENDYOL_API_KEY_HEADER]: '' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  // Real orders must keep flowing until the key Trendyol sends is known to
  // match the configured one, so nothing is rejected by default.
  describe('when not enforced (default)', () => {
    it('lets an unverified request through and logs why', () => {
      const { guard, warn } = guardWith({
        TRENDYOL_STAGING_WEBHOOK_API_KEY: apiKey,
      });
      const context = contextWith({ [TRENDYOL_API_KEY_HEADER]: 'wrong-key' });

      expect(guard.canActivate(context)).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('x-api-key does not match'),
      );
    });

    it('lets requests through when no api key is configured yet', () => {
      const { guard, warn } = guardWith({});

      expect(guard.canActivate(contextWith({}))).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('no api key configured'),
      );
    });

    it('does not log the api key it received', () => {
      const { guard, warn } = guardWith({
        TRENDYOL_STAGING_WEBHOOK_API_KEY: apiKey,
      });

      guard.canActivate(contextWith({ [TRENDYOL_API_KEY_HEADER]: 'leaked' }));

      expect(JSON.stringify(warn.mock.calls)).not.toContain('leaked');
    });
  });

  // Staging compares against the staging key, but Trendyol may send the key
  // the webhooks were registered with; the log names which setting it is.
  describe('names the known setting an unverified key matches', () => {
    const settings = {
      TRENDYOL_STAGING_API_KEY: 'staging-key',
      TRENDYOL_PRODUCTION_API_KEY: 'production-key',
      TRENDYOL_PRODUCTION_API_SECRET: 'production-secret',
    };

    it('when it is another known setting', () => {
      const { guard, warn } = guardWith(settings);

      guard.canActivate(
        contextWith({ [TRENDYOL_API_KEY_HEADER]: 'production-key' }),
      );

      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).toContain('matches TRENDYOL_PRODUCTION_API_KEY');
      expect(logged).not.toContain('production-key');
    });

    it('when it is none of them', () => {
      const { guard, warn } = guardWith(settings);

      guard.canActivate(contextWith({ [TRENDYOL_API_KEY_HEADER]: 'other' }));

      expect(JSON.stringify(warn.mock.calls)).toContain(
        'matches no known setting',
      );
    });
  });

  it('reads the production api key in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { guard } = guardWith({
        TRENDYOL_PRODUCTION_WEBHOOK_API_KEY: apiKey,
        TRENDYOL_STAGING_WEBHOOK_API_KEY: 'staging-key',
        TRENDYOL_WEBHOOK_ENFORCE: 'true',
      });
      const context = contextWith({ [TRENDYOL_API_KEY_HEADER]: apiKey });

      expect(guard.canActivate(context)).toBe(true);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  // Like the Shopify guard falling back to the app secret: the webhooks may
  // have been registered with the API key we already use to call Trendyol.
  it('falls back to the Trendyol API key when no webhook key is set', () => {
    const { guard } = guardWith({
      TRENDYOL_STAGING_API_KEY: apiKey,
      TRENDYOL_WEBHOOK_ENFORCE: 'true',
    });
    const context = contextWith({ [TRENDYOL_API_KEY_HEADER]: apiKey });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('prefers the webhook key over the Trendyol API key', () => {
    const { guard } = guardWith({
      TRENDYOL_STAGING_WEBHOOK_API_KEY: apiKey,
      TRENDYOL_STAGING_API_KEY: 'api-key',
      TRENDYOL_WEBHOOK_ENFORCE: 'true',
    });
    const context = contextWith({ [TRENDYOL_API_KEY_HEADER]: 'api-key' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('guards the order status webhook, which stays public', () => {
    const handler = TrendyolController.prototype.orderStatusWebhook;

    expect(Reflect.getMetadata('isPublic', handler)).toBe(true);
    expect(Reflect.getMetadata('__guards__', handler)).toContain(
      TrendyolWebhookGuard,
    );
  });
});
