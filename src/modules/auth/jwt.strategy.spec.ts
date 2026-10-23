// user.service pulls in the Shopify service, whose node adapter jest can't load.
jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy.validate', () => {
  const findById = jest.fn().mockResolvedValue({ _id: 'ali' });
  const strategy = new JwtStrategy(
    { findById } as never,
    { get: () => 'secret' } as never,
  );

  it('loads the user of a panel token', async () => {
    await expect(strategy.validate({ username: 'ali' })).resolves.toEqual({
      _id: 'ali',
    });
  });

  // The customer app's token must not open the panel's routes.
  it("turns away the customer app's token", async () => {
    findById.mockClear();
    await expect(
      strategy.validate({ type: 'consumer', consumer: 7 } as never),
    ).resolves.toBeNull();
    expect(findById).not.toHaveBeenCalled();
  });
});
