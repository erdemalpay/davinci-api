import { isValidAppProxySignature } from './shopify-app-proxy.guard';

// Example from https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies
const query = {
  extra: ['1', '2'],
  shop: 'shop-name.myshopify.com',
  logged_in_customer_id: '1',
  path_prefix: '/apps/awesome_reviews',
  timestamp: '1317327555',
  signature: '4c68c8624d737112c91818c11017d24d334b524cb5c2b8ba08daa056f7395ddb',
};

describe('isValidAppProxySignature', () => {
  it('accepts the signature from the Shopify docs', () => {
    expect(isValidAppProxySignature(query, 'hush', 1317327555)).toBe(true);
  });

  it('rejects a changed customer id', () => {
    expect(
      isValidAppProxySignature(
        { ...query, logged_in_customer_id: '2' },
        'hush',
        1317327555,
      ),
    ).toBe(false);
  });

  it('rejects an old signature', () => {
    expect(isValidAppProxySignature(query, 'hush', 1317327555 + 3600)).toBe(
      false,
    );
  });

  it('rejects a missing signature or secret', () => {
    const { signature, ...unsigned } = query;
    expect(signature).toBeDefined();
    expect(isValidAppProxySignature(unsigned, 'hush', 1317327555)).toBe(false);
    expect(isValidAppProxySignature(query, '', 1317327555)).toBe(false);
  });
});
