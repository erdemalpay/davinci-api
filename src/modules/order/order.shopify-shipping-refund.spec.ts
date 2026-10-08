jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { OrderService } from './order.service';

const SHOPIFY_ORDER_ID = '6689929527353';
const REFUND_ID = '951724245049';

// #6136 — tahsilat 137730: 360 TL ürün + 135 TL kargo.
const buildService = (collections: any[]) => {
  const collectionModel = {
    findOne: jest.fn((filter: any) => ({
      sort: jest.fn(async () => {
        const matches = collections
          .filter(
            (c) =>
              c.shopifyId === filter.shopifyId &&
              c.status !== filter.status.$ne,
          )
          .sort(
            (a, b) =>
              (b.shopifyShippingAmount ?? 0) - (a.shopifyShippingAmount ?? 0),
          );
        return matches[0] ?? null;
      }),
    })),
    findByIdAndUpdate: jest.fn(async (id: number, update: any) => {
      const collection = collections.find((c) => c._id === id);
      Object.assign(collection, update.$set ?? {});
      if (update.$addToSet?.shopifyRefundIds) {
        collection.shopifyRefundIds = [
          ...(collection.shopifyRefundIds ?? []),
          update.$addToSet.shopifyRefundIds,
        ];
      }
      return collection;
    }),
  };

  const websocketGateway = {
    emitOrderUpdated: jest.fn(),
    emitCollectionChanged: jest.fn(),
  };

  const service = new (OrderService as any)(
    undefined,
    undefined,
    undefined,
    undefined,
    collectionModel,
    ...Array(7).fill(undefined),
    websocketGateway,
    ...Array(11).fill(undefined),
  );

  for (const level of ['log', 'warn', 'error'] as const) {
    jest.spyOn((service as any).logger, level).mockImplementation(() => void 0);
  }

  return { service, collectionModel, websocketGateway };
};

const collection6136 = () => ({
  _id: 137730,
  amount: 360,
  status: 'paid',
  shopifyId: SHOPIFY_ORDER_ID,
  shopifyOrderNumber: '6136',
  shopifyShippingAmount: 135,
});

describe('#6136 — sadece kargo ücreti iadesi', () => {
  it('kargo 135 TL -> 0 TL olur, ürün tutarı değişmez (net 495 -> 360)', async () => {
    const collection = collection6136();
    const { service, websocketGateway } = buildService([collection]);

    await service.refundShopifyShipping(SHOPIFY_ORDER_ID, 135, REFUND_ID);

    expect(collection.shopifyShippingAmount).toBe(0);
    expect(collection.amount).toBe(360);
    expect(collection.status).toBe('paid');
    expect(collection).toMatchObject({ shopifyRefundIds: [REFUND_ID] });
    expect(websocketGateway.emitCollectionChanged).toHaveBeenCalledWith(
      collection,
    );
  });

  it('aynı iade webhookı iki kez gelirse kargo mükerrer düşülmez', async () => {
    const collection = collection6136();
    const { service, collectionModel } = buildService([collection]);

    await service.refundShopifyShipping(SHOPIFY_ORDER_ID, 135, REFUND_ID);
    await service.refundShopifyShipping(SHOPIFY_ORDER_ID, 135, REFUND_ID);

    expect(collection.shopifyShippingAmount).toBe(0);
    expect(collectionModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('kısmi kargo iadesi yalnızca iade edilen kadarını düşer', async () => {
    const collection = collection6136();
    const { service } = buildService([collection]);

    await service.refundShopifyShipping(SHOPIFY_ORDER_ID, 35, REFUND_ID);

    expect(collection.shopifyShippingAmount).toBe(100);
  });

  it('iade kargo tutarını aşarsa kargo eksiye düşmez', async () => {
    const collection = collection6136();
    const { service } = buildService([collection]);

    await service.refundShopifyShipping(SHOPIFY_ORDER_ID, 200, REFUND_ID);

    expect(collection.shopifyShippingAmount).toBe(0);
    expect(collection.amount).toBe(360);
  });
});

describe('#5834 / #4206 — sipariş zaten iptal edilmişse', () => {
  it('aktif tahsilat yoksa hiçbir şey değiştirmez', async () => {
    const cancelled = {
      ...collection6136(),
      status: 'cancelled',
    };
    const { service, collectionModel, websocketGateway } = buildService([
      cancelled,
    ]);

    const result = await service.refundShopifyShipping(
      SHOPIFY_ORDER_ID,
      135,
      REFUND_ID,
    );

    expect(result).toBeNull();
    expect(cancelled.shopifyShippingAmount).toBe(135);
    expect(collectionModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(websocketGateway.emitCollectionChanged).not.toHaveBeenCalled();
  });

  it('kısmi iptalden sonra kargo, kargoyu taşıyan aktif tahsilattan düşülür', async () => {
    const audit = {
      _id: 1,
      amount: 199,
      status: 'cancelled',
      shopifyId: SHOPIFY_ORDER_ID,
      shopifyShippingAmount: 0,
    };
    const active = { ...collection6136(), _id: 2 };
    const { service } = buildService([audit, active]);

    await service.refundShopifyShipping(SHOPIFY_ORDER_ID, 135, REFUND_ID);

    expect(active.shopifyShippingAmount).toBe(0);
    expect(audit.shopifyShippingAmount).toBe(0);
  });
});
