import { HttpException, Logger } from '@nestjs/common';
import { LoyaltyService, pointsFor } from './loyalty.service';
import { LoyaltyCouponStatus, LoyaltyTransactionType } from './loyalty.schema';

jest.mock('../shopify/shopify.service', () => ({
  ShopifyService: class ShopifyService {},
}));
jest.mock('../websocket/websocket.gateway', () => ({
  AppWebSocketGateway: class AppWebSocketGateway {},
}));

// A Mongoose model stand-in: `new Model(doc).save()` plus static queries.
const makeModel = (statics: Record<string, jest.Mock> = {}) => {
  const saved: any[] = [];
  const Model: any = jest.fn().mockImplementation((doc) => ({
    ...doc,
    save: jest.fn().mockImplementation(async () => {
      saved.push(doc);
      return doc;
    }),
  }));
  Object.assign(Model, statics);
  Model.saved = saved;
  return Model;
};

const settings = {
  isActive: true,
  earnRate: 3,
  couponValidityDays: 30,
  minRedeemPoints: 50,
};

const setup = (
  overrides: {
    settings?: Partial<typeof settings>;
    account?: any;
    earn?: any;
    reversals?: any[];
    usedCoupon?: any;
    graphql?: jest.Mock;
  } = {},
) => {
  const account = overrides.account ?? null;
  const accountModel = makeModel({
    findOne: jest.fn().mockResolvedValue(account),
    findById: jest.fn().mockResolvedValue(account),
    findOneAndUpdate: jest
      .fn()
      .mockImplementation(async (filter, update) =>
        account &&
        (filter.balance?.$gte === undefined ||
          account.balance >= filter.balance.$gte)
          ? { ...account, balance: account.balance + update.$inc.balance }
          : null,
      ),
    updateOne: jest.fn().mockResolvedValue({}),
  });
  const transactionModel = makeModel({
    findOne: jest.fn().mockResolvedValue(overrides.earn ?? null),
    find: jest.fn().mockResolvedValue(overrides.reversals ?? []),
  });
  const couponModel = makeModel({
    findOne: jest.fn().mockResolvedValue(overrides.usedCoupon ?? null),
    findOneAndUpdate: jest
      .fn()
      .mockImplementation(async () =>
        overrides.usedCoupon
          ? { ...overrides.usedCoupon, status: LoyaltyCouponStatus.RETURNED }
          : null,
      ),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  });
  const settingsModel = makeModel({
    findById: jest
      .fn()
      .mockResolvedValue({ ...settings, ...overrides.settings }),
  });
  const session = {
    withTransaction: jest.fn(async (work) => work()),
    endSession: jest.fn(),
  };
  const conn = { startSession: jest.fn().mockResolvedValue(session) };
  const shopifyService = {
    adminGraphQL: overrides.graphql ?? jest.fn(),
    getCustomerById: jest.fn(),
  };
  const websocketGateway = { emitLoyaltyChanged: jest.fn() };
  const service = new LoyaltyService(
    accountModel,
    transactionModel,
    couponModel,
    settingsModel,
    conn as never,
    shopifyService as never,
    websocketGateway as never,
  );
  return {
    service,
    accountModel,
    transactionModel,
    couponModel,
    shopifyService,
  };
};

const order = (fields: Record<string, any> = {}) => ({
  id: 5001,
  name: '#1001',
  current_subtotal_price: '1250.00',
  source_name: 'web',
  customer: {
    id: 777,
    email: 'a@b.c',
    first_name: 'Ada',
    last_name: 'Kaya',
  },
  ...fields,
});

beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation());
afterEach(() => jest.restoreAllMocks());

describe('pointsFor', () => {
  it('rounds down to whole points', () => {
    expect(pointsFor(1250, 3)).toBe(37);
    expect(pointsFor(100, 3)).toBe(3);
    expect(pointsFor(33.33, 3)).toBe(0);
    expect(pointsFor(-50, 3)).toBe(0);
  });
});

describe('LoyaltyService.earnForOrder', () => {
  const account = { _id: 1, shopifyCustomerId: '777', balance: 10 };

  it('credits rate % of the order subtotal once fulfilled', async () => {
    const { service, accountModel, transactionModel } = setup({ account });

    await service.earnForOrder(order());

    expect(accountModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 1 },
      expect.objectContaining({ $inc: { balance: 37, totalEarned: 37 } }),
      expect.anything(),
    );
    expect(transactionModel.saved[0]).toMatchObject({
      type: LoyaltyTransactionType.EARN,
      change: 37,
      balanceAfter: 47,
      shopifyOrderId: '5001',
      orderAmount: 1250,
      rate: 3,
    });
  });

  it.each([
    ['program is off', {}, { isActive: false }],
    ['guest order', { customer: null }, {}],
    ['test order', { test: true }, {}],
    ['cancelled order', { cancelled_at: '2026-11-14T10:00:00Z' }, {}],
    ['cafe POS sale', { source_name: 'pos' }, {}],
    ['too small for a point', { current_subtotal_price: '20.00' }, {}],
  ])('skips a %s', async (_label, fields, settingsOverride) => {
    const { service, accountModel } = setup({
      account,
      settings: settingsOverride,
    });

    expect(await service.earnForOrder(order(fields))).toBeNull();
    expect(accountModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('ignores a repeated webhook for the same order', async () => {
    const { service, transactionModel } = setup({ account });
    transactionModel.mockImplementation((doc) => ({
      ...doc,
      save: jest.fn().mockRejectedValue({ code: 11000 }),
    }));

    expect(await service.earnForOrder(order())).toBeNull();
  });
});

describe('LoyaltyService.reconcileOrder', () => {
  const account = { _id: 1, shopifyCustomerId: '777', balance: 37 };
  const earn = { account: 1, change: 37, rate: 3 };
  const shopifyOrder = (amount: string, cancelledAt: string | null = null) =>
    jest.fn().mockResolvedValue({
      order: {
        name: '#1001',
        cancelledAt,
        currentSubtotalPriceSet: { shopMoney: { amount } },
      },
    });

  it('takes back the points of the refunded part', async () => {
    const { service, transactionModel } = setup({
      account,
      earn,
      graphql: shopifyOrder('1000.00'),
    });

    await service.reconcileOrder('5001');

    expect(transactionModel.saved[0]).toMatchObject({
      type: LoyaltyTransactionType.EARN_REVERSAL,
      change: -7,
      note: 'Sipariş iadesi',
    });
  });

  it('counts earlier reversals so a second refund webhook takes nothing twice', async () => {
    const { service, accountModel } = setup({
      account,
      earn,
      reversals: [{ change: -7 }],
      graphql: shopifyOrder('1000.00'),
    });

    await service.reconcileOrder('5001');

    expect(accountModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('takes back everything on cancel and returns a used coupon', async () => {
    const usedCoupon = { _id: 9, account: 1, code: 'PUAN-ABC', value: 50 };
    const { service, transactionModel, couponModel } = setup({
      account,
      earn,
      usedCoupon,
      graphql: shopifyOrder('0.00', '2026-11-14T10:00:00Z'),
    });

    await service.reconcileOrder('5001');

    expect(transactionModel.saved.map((t) => [t.type, t.change])).toEqual([
      [LoyaltyTransactionType.EARN_REVERSAL, -37],
      [LoyaltyTransactionType.COUPON_RETURN, 50],
    ]);
    expect(couponModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 9, status: LoyaltyCouponStatus.USED },
      { $set: { status: LoyaltyCouponStatus.RETURNED } },
      expect.anything(),
    );
  });

  it('does not ask Shopify about orders that never earned or used points', async () => {
    const graphql = jest.fn();
    const { service } = setup({ account, graphql });

    await service.reconcileOrder('5001');

    expect(graphql).not.toHaveBeenCalled();
  });
});

describe('LoyaltyService.redeem', () => {
  const account = { _id: 1, shopifyCustomerId: '777', balance: 120 };
  const created = jest.fn().mockResolvedValue({
    discountCodeBasicCreate: {
      codeDiscountNode: { id: 'gid://shopify/DiscountCodeNode/1' },
    },
  });

  it('turns points into a single-use coupon only this customer can use', async () => {
    const { service, couponModel, transactionModel } = setup({
      account,
      graphql: created,
    });

    const result = await service.redeem('777', 100);

    expect(result.code).toMatch(/^PUAN-[A-HJ-NP-Z2-9]{8}$/);
    expect(result.balance).toBe(20);
    const input = created.mock.calls[0][1].input;
    expect(input.context.customers.add).toEqual(['gid://shopify/Customer/777']);
    expect(input.usageLimit).toBe(1);
    expect(input.customerGets.value.discountAmount.amount).toBe('100.00');
    expect(input.combinesWith).toEqual({
      orderDiscounts: false,
      productDiscounts: false,
      shippingDiscounts: false,
    });
    expect(couponModel.saved[0]).toMatchObject({
      value: 100,
      status: LoyaltyCouponStatus.ACTIVE,
    });
    expect(transactionModel.saved[0]).toMatchObject({
      type: LoyaltyTransactionType.REDEEM,
      change: -100,
      balanceAfter: 20,
    });
  });

  it('refuses less than the minimum and more than the balance', async () => {
    const { service } = setup({ account, graphql: created });

    await expect(service.redeem('777', 40)).rejects.toThrow(HttpException);
    await expect(service.redeem('777', 200)).rejects.toThrow('Yetersiz puan');
  });

  it('gives the points back when Shopify cannot create the coupon', async () => {
    const { service, accountModel, couponModel } = setup({
      account,
      graphql: jest.fn().mockRejectedValue(new Error('Shopify down')),
    });
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(service.redeem('777', 100)).rejects.toThrow(
      'Kupon oluşturulamadı',
    );
    expect(accountModel.updateOne).toHaveBeenCalledWith(
      { _id: 1 },
      { $inc: { balance: 100 } },
    );
    expect(couponModel.saved).toHaveLength(0);
  });
});

describe('LoyaltyService.markCouponsUsed', () => {
  it('marks only loyalty coupons of the order used', async () => {
    const { service, couponModel } = setup();

    await service.markCouponsUsed(
      order({ discount_codes: [{ code: 'puan-abcd2345' }, { code: 'YAZ10' }] }),
    );

    expect(couponModel.updateMany).toHaveBeenCalledWith(
      { code: { $in: ['PUAN-ABCD2345'] }, status: LoyaltyCouponStatus.ACTIVE },
      {
        $set: expect.objectContaining({
          status: LoyaltyCouponStatus.USED,
          usedOrderId: '5001',
          usedOrderName: '#1001',
        }),
      },
    );
  });
});
