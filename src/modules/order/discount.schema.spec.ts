import { DiscountSchema } from './discount.schema';

describe('DiscountSchema', () => {
  it('defaults custom discounts to false', () => {
    const isCustomPath = DiscountSchema.path('isCustom');

    expect(isCustomPath).toBeDefined();
    expect(isCustomPath.instance).toBe('Boolean');
    expect(isCustomPath.options.default).toBe(false);
  });
});
