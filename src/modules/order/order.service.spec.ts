jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { HttpStatus } from '@nestjs/common';
import { OrderService } from './order.service';

describe('OrderService retailer order requests', () => {
  const createService = ({
    retailer,
    saveMock = jest.fn().mockResolvedValue({ _id: 10 }),
    retailerOrderRequests = [],
  }: {
    retailer?: { _id: number };
    saveMock?: jest.Mock;
    retailerOrderRequests?: unknown[];
  }) => {
    const retailerModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(retailer ?? null),
        }),
      }),
    };

    const retailerOrderRequestModel: any = jest
      .fn()
      .mockImplementation((doc) => ({
        ...doc,
        save: saveMock,
      }));
    retailerOrderRequestModel.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(retailerOrderRequests),
        }),
      }),
    });

    const service = new (OrderService as any)(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      retailerModel,
      retailerOrderRequestModel,
    );

    return { service, retailerModel, retailerOrderRequestModel, saveMock };
  };

  it('creates retailer order requests for the retailer matching tenant and project slugs', async () => {
    const { service, retailerModel, retailerOrderRequestModel, saveMock } =
      createService({
        retailer: { _id: 7 },
      });

    const result = await service.createRetailerOrderRequest({
      tenantSlug: 'tenant-a',
      projectSlug: 'project-a',
      orders: [
        {
          _id: '6a56e69f5e4bc5139a37506c',
          date: new Date('2026-07-15T00:00:00Z'),
          product: [
            {
              productDavinciId: 1441,
              productId: '6a486f0faadf8857d624d263',
              quantity: 1,
            },
          ],
          status: 'pending',
        },
      ],
    });

    expect(retailerModel.findOne).toHaveBeenCalledWith({
      tenantSlug: 'tenant-a',
      projectSlug: 'project-a',
    });
    expect(retailerOrderRequestModel).toHaveBeenCalledWith({
      retailerId: 7,
      orderId: '6a56e69f5e4bc5139a37506c',
      date: new Date('2026-07-15T00:00:00Z'),
      status: 'pending',
      products: [
        {
          productDavinciId: 1441,
          productId: '6a486f0faadf8857d624d263',
          quantity: 1,
        },
      ],
    });
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ _id: 10 }]);
  });

  it('throws not found when no retailer matches the slugs', async () => {
    const { service } = createService({});

    await expect(
      service.createRetailerOrderRequest({
        tenantSlug: 'missing',
        projectSlug: 'missing',
        orders: [],
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('gets retailer order requests for the retailer matching tenant and project slugs', async () => {
    const retailerOrderRequests = [
      {
        _id: 11,
        retailerId: 7,
        orderId: '6a56e69f5e4bc5139a37506c',
        status: 'pending',
      },
    ];
    const { service, retailerModel, retailerOrderRequestModel } =
      createService({
        retailer: { _id: 7 },
        retailerOrderRequests,
      });

    const result = await service.getRetailerOrderRequests({
      tenantSlug: 'tenant-a',
      projectSlug: 'project-a',
    });

    expect(retailerModel.findOne).toHaveBeenCalledWith({
      tenantSlug: 'tenant-a',
      projectSlug: 'project-a',
    });
    expect(retailerOrderRequestModel.find).toHaveBeenCalledWith({
      retailerId: 7,
    });
    expect(result).toEqual(retailerOrderRequests);
  });
});
