import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import {
  isValidShopifyHmac,
  SHOPIFY_HMAC_HEADER,
  ShopifyWebhookGuard,
} from './shopify-webhook.guard';

describe('ShopifyWebhookGuard', () => {
  const secret = 'webhook-secret';
  const body = Buffer.from(JSON.stringify({ id: 1, line_items: [] }));
  const sign = (payload: Buffer, key = secret) =>
    createHmac('sha256', key).update(payload).digest('base64');

  function guardWith(config: Record<string, string>) {
    const configService = {
      get: jest.fn((key: string) => config[key]),
    } as unknown as ConfigService;
    return new ShopifyWebhookGuard(configService);
  }

  function contextWith(
    headers: Record<string, string>,
    rawBody: Buffer | undefined = body,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          rawBody,
          method: 'POST',
          path: '/shopify/order-create-webhook',
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows a request signed with the webhook secret', () => {
    const guard = guardWith({ SHOPIFY_STAGING_WEBHOOK_SECRET: secret });
    const context = contextWith({ [SHOPIFY_HMAC_HEADER]: sign(body) });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('falls back to the app secret when no webhook secret is set', () => {
    const guard = guardWith({ SHOPIFY_STAGING_API_SECRET: secret });
    const context = contextWith({ [SHOPIFY_HMAC_HEADER]: sign(body) });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a request without a signature', () => {
    const guard = guardWith({ SHOPIFY_STAGING_WEBHOOK_SECRET: secret });

    expect(() => guard.canActivate(contextWith({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a request signed with another secret', () => {
    const guard = guardWith({ SHOPIFY_STAGING_WEBHOOK_SECRET: secret });
    const context = contextWith({
      [SHOPIFY_HMAC_HEADER]: sign(body, 'wrong-secret'),
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a request whose body was changed after signing', () => {
    const guard = guardWith({ SHOPIFY_STAGING_WEBHOOK_SECRET: secret });
    const context = contextWith(
      { [SHOPIFY_HMAC_HEADER]: sign(body) },
      Buffer.from(JSON.stringify({ id: 2, line_items: [] })),
    );

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('only logs invalid signatures when enforcement is disabled', () => {
    const guard = guardWith({
      SHOPIFY_STAGING_WEBHOOK_SECRET: secret,
      SHOPIFY_WEBHOOK_HMAC_ENFORCE: 'false',
    });

    expect(guard.canActivate(contextWith({}))).toBe(true);
  });

  it('never accepts a request when no secret is configured', () => {
    expect(isValidShopifyHmac(body, sign(body, ''), '')).toBe(false);
  });
});
