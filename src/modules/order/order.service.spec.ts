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
    updatedRetailerOrderRequest = null,
    httpPostMock = jest.fn().mockResolvedValue({ data: {} }),
  }: {
    retailer?: { _id: number; tenantSlug?: string; projectSlug?: string };
    saveMock?: jest.Mock;
    retailerOrderRequests?: unknown[];
    updatedRetailerOrderRequest?: unknown;
    httpPostMock?: jest.Mock;
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
    retailerOrderRequestModel.findOneAndUpdate = jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedRetailerOrderRequest),
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
      ...Array(15).fill(undefined),
      {
        axiosRef: {
          post: httpPostMock,
        },
      },
    );

    return {
      service,
      retailerModel,
      retailerOrderRequestModel,
      saveMock,
      httpPostMock,
    };
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

  it('updates retailer order request status for the retailer matching tenant and project slugs', async () => {
    const updatedRetailerOrderRequest = {
      _id: 11,
      retailerId: 7,
      orderId: '6a56e69f5e4bc5139a37506c',
      status: 'approved',
    };
    const { service, retailerModel, retailerOrderRequestModel } =
      createService({
        retailer: { _id: 7 },
        updatedRetailerOrderRequest,
      });

    const result = await service.updateRetailerOrderRequestStatus(
      '6a56e69f5e4bc5139a37506c',
      {
        tenantSlug: 'tenant-a',
        projectSlug: 'project-a',
        status: 'approved',
      },
    );

    expect(retailerModel.findOne).toHaveBeenCalledWith({
      tenantSlug: 'tenant-a',
      projectSlug: 'project-a',
    });
    expect(retailerOrderRequestModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        retailerId: 7,
        orderId: '6a56e69f5e4bc5139a37506c',
      },
      { status: 'approved' },
      { new: true },
    );
    expect(result).toEqual(updatedRetailerOrderRequest);
  });

  it('throws not found when updating a missing retailer order request', async () => {
    const { service } = createService({
      retailer: { _id: 7 },
      updatedRetailerOrderRequest: null,
    });

    await expect(
      service.updateRetailerOrderRequestStatus('missing-order', {
        tenantSlug: 'tenant-a',
        projectSlug: 'project-a',
        status: 'approved',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('marks Davinci order as in delivery when retailer request status is indelivery', async () => {
    const orderId = '6a56e69f5e4bc5139a37506c';
    const { service, httpPostMock } = createService({
      retailer: {
        _id: 7,
        tenantSlug: 'retailer-tenant',
        projectSlug: 'retailer-project',
      },
      updatedRetailerOrderRequest: {
        _id: 11,
        retailerId: 7,
        orderId,
        status: 'indelivery',
      },
    });

    await service.updateRetailerOrderRequestStatus(orderId, {
      tenantSlug: 'tenant-from-request',
      projectSlug: 'project-from-request',
      status: 'indelivery',
    });

    expect(httpPostMock).toHaveBeenCalledWith(
      'https://api-production.autoapi.org/api/v1/retailer-tenant/retailer-project/dynamic/workflow/manual.markDavinciOrderInDelivery?schemaName=davinciOrder',
      { _id: orderId },
    );
  });

  it('does not mark Davinci order as in delivery for other statuses', async () => {
    const { service, httpPostMock } = createService({
      retailer: {
        _id: 7,
        tenantSlug: 'retailer-tenant',
        projectSlug: 'retailer-project',
      },
      updatedRetailerOrderRequest: {
        _id: 11,
        retailerId: 7,
        orderId: '6a56e69f5e4bc5139a37506c',
        status: 'approved',
      },
    });

    await service.updateRetailerOrderRequestStatus(
      '6a56e69f5e4bc5139a37506c',
      {
        tenantSlug: 'tenant-a',
        projectSlug: 'project-a',
        status: 'approved',
      },
    );

    expect(httpPostMock).not.toHaveBeenCalled();
  });
});
