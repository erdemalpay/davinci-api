jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { TrendyolController } from './trendyol.controller';

describe('TrendyolController route access', () => {
  const isPublic = (handler: keyof TrendyolController) =>
    Reflect.getMetadata('isPublic', TrendyolController.prototype[handler]) ===
    true;

  // Trendyol posts order events without a user JWT.
  it('keeps the order status webhook public', () => {
    expect(isPublic('orderStatusWebhook')).toBe(true);
  });

  // These manage the webhooks registered on Trendyol; anonymous callers must
  // not be able to list, create or delete them.
  it.each(['getWebhooks', 'createWebhook', 'deleteWebhook'] as const)(
    'requires a logged-in user for %s',
    (handler) => {
      expect(isPublic(handler)).toBe(false);
    },
  );
});
