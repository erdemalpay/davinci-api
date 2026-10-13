jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { HttpException } from '@nestjs/common';
import { StockHistoryStatusEnum } from '../accounting/accounting.dto';
import { OrderService } from './order.service';

const user = { _id: 'u1' } as any;

const buildOrder = (overrides: Record<string, unknown> = {}) => {
  const order: any = {
    _id: 1,
    quantity: 2,
    unitPrice: 100,
    status: 'pending',
    stockLocation: 6,
    item: {
      itemProduction: [{ isDecrementStock: true, product: 'p1', quantity: 1 }],
    },
    ...overrides,
  };
  order.toObject = () => {
    const plain = { ...order };
    delete plain.toObject;
    return plain;
  };
  return order;
};

const buildCollection = () => {
  const collection: any = { _id: 10, amount: 200, orders: [{ order: 1 }] };
  collection.toObject = () => ({ ...collection });
  return collection;
};

const buildService = (order: any) => {
  const session = {
    withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()),
    endSession: jest.fn(),
  };
  const conn = { startSession: jest.fn(async () => session) };
  const orderModel = {
    findOne: jest.fn<{ populate: jest.Mock }, any[]>(() => ({
      populate: jest.fn(async () => order),
    })),
    create: jest.fn(async ([doc]: any[]) => [{ _id: 2, ...doc }]),
    findByIdAndUpdate: jest.fn<Promise<any>, any[]>(async (id: number) => ({
      _id: id,
      status: 'cancelled',
    })),
  };
  const collectionModel = {
    findOne: jest.fn<Promise<any>, any[]>(async () => buildCollection()),
    create: jest.fn(async ([doc]: any[]) => [{ _id: 11, ...doc }]),
    findByIdAndUpdate: jest.fn(async () => ({})),
  };
  const websocketGateway = {
    emitOrderUpdated: jest.fn(async () => undefined),
    emitCollectionChanged: jest.fn(),
  };
  const accountingService = {
    createStock: jest.fn<Promise<void>, any[]>(async () => undefined),
  };

  const service = new (OrderService as any)(
    conn,
    undefined,
    orderModel,
    undefined,
    collectionModel,
    ...Array(7).fill(undefined),
    websocketGateway,
    undefined,
    accountingService,
    ...Array(9).fill(undefined),
  );
  jest.spyOn((service as any).logger, 'error').mockImplementation(() => void 0);

  return { service, orderModel, collectionModel, accountingService };
};

describe('Pazaryeri sipariş iptali', () => {
  it('Trendyol: satır ID ve paket no ile bulunur, müşteri alanları silinir', async () => {
    const { service, orderModel, collectionModel, accountingService } =
      buildService(buildOrder({ trendyolShipmentPackageId: 'PKG1' }));

    await service.cancelTrendyolOrder(user, 'L1', 2);

    expect(orderModel.findOne).toHaveBeenCalledWith(
      { trendyolLineItemId: 'L1' },
      null,
      expect.anything(),
    );
    expect(collectionModel.findOne).toHaveBeenCalledWith(
      { trendyolShipmentPackageId: 'PKG1', status: { $ne: 'cancelled' } },
      null,
      expect.anything(),
    );
    expect(orderModel.findByIdAndUpdate.mock.calls[0][1]).toMatchObject({
      $unset: { trendyolCustomer: '', isTrendyolCustomerPicked: '' },
    });
    expect(accountingService.createStock).toHaveBeenCalledWith(user, {
      product: 'p1',
      location: 6,
      quantity: 2,
      status: StockHistoryStatusEnum.TRENDYOLORDERCANCEL,
    });
  });

  it('Hepsiburada: sipariş numarasıyla bulunur, $unset yapılmaz', async () => {
    const { service, orderModel, collectionModel, accountingService } =
      buildService(buildOrder({ hepsiburadaOrderNumber: 'HB1' }));

    await service.cancelHepsiburadaOrder(user, 'L1', 2);

    expect(orderModel.findOne.mock.calls[0][0]).toEqual({
      hepsiburadaLineItemId: 'L1',
    });
    expect(collectionModel.findOne.mock.calls[0][0]).toEqual({
      hepsiburadaOrderNumber: 'HB1',
      status: { $ne: 'cancelled' },
    });
    expect(orderModel.findByIdAndUpdate.mock.calls[0][1]).not.toHaveProperty(
      '$unset',
    );
    expect(accountingService.createStock.mock.calls[0][1].status).toBe(
      StockHistoryStatusEnum.HEPSIBURADAORDERCANCEL,
    );
  });

  it('n11: paket no varsa paket no ile, yoksa sipariş numarasıyla bulunur', async () => {
    const withPackage = buildService(
      buildOrder({ n11ShipmentPackageId: 'P1', n11OrderNumber: 'N1' }),
    );
    await withPackage.service.cancelN11Order(user, 'L1', 2);
    expect(withPackage.collectionModel.findOne.mock.calls[0][0]).toEqual({
      'orders.order': 1,
      n11ShipmentPackageId: 'P1',
      status: { $ne: 'cancelled' },
    });

    const withoutPackage = buildService(
      buildOrder({ n11ShipmentPackageId: null, n11OrderNumber: 'N1' }),
    );
    await withoutPackage.service.cancelN11Order(user, 'L1', 2);
    expect(withoutPackage.collectionModel.findOne.mock.calls[0][0]).toEqual({
      'orders.order': 1,
      n11OrderNumber: 'N1',
      status: { $ne: 'cancelled' },
    });
    expect(
      withoutPackage.accountingService.createStock.mock.calls[0][1].status,
    ).toBe(StockHistoryStatusEnum.N11ORDERCANCEL);
  });

  it('kısmi iptalde iptal edilen kopya satır ID taşımaz', async () => {
    const { service, orderModel } = buildService(
      buildOrder({ n11LineItemId: 'L1', n11OrderNumber: 'N1' }),
    );

    await service.cancelN11Order(user, 'L1', 1);

    const [[created]] = orderModel.create.mock.calls[0];
    expect(created).not.toHaveProperty('n11LineItemId');
    expect(created).toMatchObject({ quantity: 1, status: 'cancelled' });
    expect(orderModel.findByIdAndUpdate).toHaveBeenCalledWith(
      1,
      { $set: { quantity: 1, paidQuantity: 1 } },
      expect.anything(),
    );
  });

  it('sipariş bulunamazsa 404 fırlatır', async () => {
    const { service } = buildService(null);

    await expect(service.cancelHepsiburadaOrder(user, 'X', 1)).rejects.toThrow(
      HttpException,
    );
  });
});
