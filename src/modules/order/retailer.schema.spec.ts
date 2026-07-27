import { RetailerSchema } from './retailer.schema';

describe('RetailerSchema', () => {
  it('allows an optional string request token', () => {
    const requestTokenPath = RetailerSchema.path('requestToken');

    expect(requestTokenPath).toBeDefined();
    expect(requestTokenPath.instance).toBe('String');
    expect(requestTokenPath.options.required).toBe(false);
  });
});
