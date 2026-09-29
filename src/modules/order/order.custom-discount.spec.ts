jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { HttpStatus } from '@nestjs/common';
import { RACE_CONDITION_LOCK_METADATA } from '../lock/race-condition-lock.decorator';
import { RedisKeys } from '../redis/redis.dto';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

type BuildServiceOptions = {
  existingCustomDiscount?: unknown;
  foundDiscount?: Record<string, unknown> | null;
  order?: Record<string, any> | null;
  table?: Record<string, any> | null;
};

const makeOrder = (overrides: Record<string, unknown> = {}) => {
  const order: Record<string, any> = {
    _id: 101,
    table: 7,
    quantity: 3,
    paidQuantity: 0,
    unitPrice: 20,
    tableDate: new Date('2026-09-29T00:00:00.000Z'),
    ...overrides,
  };
  order.save = jest.fn().mockImplementation(async () => order);
  order.toObject = jest.fn().mockImplementation(() => {
    const { save, toObject, ...values } = order;
    return values;
  });
  return order;
};

const buildService = ({
  existingCustomDiscount = null,
  foundDiscount = null,
  order = null,
  table = { _id: 7, isOnlineSale: false },
}: BuildServiceOptions = {}) => {
  const createdOrders: Record<string, any>[] = [];
  const orderModel: any = jest.fn().mockImplementation((values) => {
    const createdOrder = makeOrder({
      _id: 202 + createdOrders.length,
      ...values,
    });
    createdOrders.push(createdOrder);
    return createdOrder;
  });
  orderModel.findById = jest.fn().mockResolvedValue(order);
  orderModel.findByIdAndUpdate = jest
    .fn()
    .mockImplementation(async (_id, update) => {
      if (order) Object.assign(order, update);
      return order;
    });
  orderModel.findByIdAndDelete = jest.fn().mockResolvedValue(order);

  const save = jest.fn().mockResolvedValue(undefined);
  const discountModel: any = jest.fn().mockImplementation((doc) => ({
    ...doc,
    save,
  }));
  discountModel.findOne = jest
    .fn()
    .mockResolvedValue(existingCustomDiscount);
  discountModel.findById = jest.fn().mockResolvedValue(foundDiscount);
  discountModel.findByIdAndUpdate = jest
    .fn()
    .mockImplementation(async (_id, update) => ({
      ...(foundDiscount ?? {}),
      ...update,
    }));

  const websocketGateway = {
    emitDiscountChanged: jest.fn(),
    emitOrderUpdated: jest.fn(),
    emitOrderCreated: jest.fn(),
    emitOrderDeleted: jest.fn(),
  };
  const activityService = { addActivity: jest.fn().mockResolvedValue(null) };
  const tableService = {
    updateTableOrders: jest.fn().mockResolvedValue({ _id: 7 }),
    findById: jest.fn().mockResolvedValue(table),
  };

  const service = new (OrderService as any)(
    undefined,
    undefined,
    orderModel,
    undefined,
    undefined,
    discountModel,
    undefined,
    undefined,
    undefined,
    tableService,
    undefined,
    undefined,
    websocketGateway,
    activityService,
    undefined,
    undefined,
    undefined,
    ...Array(7).fill(undefined),
  );

  return {
    service,
    discountModel,
    orderModel,
    createdOrders,
    save,
    tableService,
    websocketGateway,
  };
};

describe('OrderService custom discount configuration', () => {
  it('creates the first active custom discount without preset values', async () => {
    const { service, discountModel, save } = buildService();

    await service.createDiscount({} as any, {
      name: 'Manager custom discount',
      isCustom: true,
      percentage: 10,
      amount: 20,
    });

    expect(discountModel).toHaveBeenCalledWith({
      name: 'Manager custom discount',
      isCustom: true,
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('rejects a second active custom discount', async () => {
    const { service, save } = buildService({
      existingCustomDiscount: { _id: 1, isCustom: true },
    });

    await expect(
      service.createDiscount({} as any, {
        name: 'Second custom discount',
        isCustom: true,
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'Only one active custom discount is allowed',
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('allows another custom discount when the existing one is deleted', async () => {
    const { service, discountModel, save } = buildService();

    await service.createDiscount({} as any, {
      name: 'Replacement custom discount',
      isCustom: true,
    });

    expect(discountModel.findOne).toHaveBeenCalledWith({
      isCustom: true,
      status: { $ne: 'deleted' },
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('rejects reactivating a deleted custom discount while another is active', async () => {
    const { service, discountModel } = buildService({
      foundDiscount: { _id: 4, isCustom: true, status: 'deleted' },
      existingCustomDiscount: { _id: 8, isCustom: true },
    });

    await expect(
      service.updateDiscount({} as any, 4, { status: '' }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'Only one active custom discount is allowed',
    });
    expect(discountModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('unsets preset values when an existing discount becomes custom', async () => {
    const { service, discountModel } = buildService({
      foundDiscount: {
        _id: 6,
        isCustom: false,
        status: '',
        percentage: 10,
      },
    });

    await service.updateDiscount({} as any, 6, {
      isCustom: true,
      percentage: 5,
      amount: 15,
    });

    expect(discountModel.findByIdAndUpdate).toHaveBeenCalledWith(
      6,
      {
        isCustom: true,
        $unset: { percentage: 1, amount: 1 },
      },
      { new: true },
    );
  });

  it('rejects Mongo update operators that could bypass custom uniqueness', async () => {
    const { service, discountModel } = buildService({
      foundDiscount: { _id: 4, isCustom: true, status: 'deleted' },
    });

    await expect(
      service.updateDiscount({} as any, 4, {
        $unset: { status: 1 },
      } as any),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'Invalid discount update fields',
    });
    expect(discountModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

describe('OrderService custom discount application', () => {
  const customDiscount = {
    _id: 50,
    name: 'Manager custom discount',
    isCustom: true,
    status: '',
    isNoteRequired: false,
    isStoreOrder: true,
    isOnlineOrder: false,
  };

  const applyCustomDiscount = (
    service: OrderService,
    selection: {
      totalQuantity: number;
      selectedQuantity: number;
      orderId: number;
    },
    customDiscountAmount: number,
    note?: string,
  ) =>
    (service as any).createOrderForDiscount(
      {},
      [selection],
      customDiscount._id,
      undefined,
      undefined,
      note,
      customDiscountAmount,
    );

  it('shares a custom total evenly across the selected quantity', async () => {
    const order = makeOrder();
    const { service, orderModel } = buildService({
      foundDiscount: customDiscount,
      order,
    });

    await applyCustomDiscount(
      service,
      { totalQuantity: 3, selectedQuantity: 3, orderId: 101 },
      12,
    );

    expect(orderModel.findByIdAndUpdate).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ discountAmount: 4 }),
      { new: true },
    );
  });

  it('does not round a non-even per-unit custom amount prematurely', async () => {
    const order = makeOrder();
    const { service, orderModel } = buildService({
      foundDiscount: customDiscount,
      order,
    });

    await applyCustomDiscount(
      service,
      { totalQuantity: 3, selectedQuantity: 3, orderId: 101 },
      10,
    );

    expect(orderModel.findByIdAndUpdate).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ discountAmount: 10 / 3 }),
      { new: true },
    );
  });

  it('splits only the affected quantity and preserves the source remainder', async () => {
    const order = makeOrder({ quantity: 5 });
    const { service, createdOrders, tableService } = buildService({
      foundDiscount: customDiscount,
      order,
    });

    await applyCustomDiscount(
      service,
      { totalQuantity: 5, selectedQuantity: 2, orderId: 101 },
      10,
    );

    expect(createdOrders[0]).toMatchObject({
      quantity: 2,
      paidQuantity: 0,
      discount: 50,
      discountAmount: 5,
    });
    expect(tableService.updateTableOrders).toHaveBeenCalledWith(
      {},
      7,
      createdOrders[0]._id,
    );
    expect(order.quantity).toBe(3);
    expect(order.save).toHaveBeenCalledTimes(1);
  });

  it('fully discounts only the selected units when total equals their price', async () => {
    const order = makeOrder({ quantity: 5, unitPrice: 20 });
    const { service, createdOrders } = buildService({
      foundDiscount: customDiscount,
      order,
    });

    await applyCustomDiscount(
      service,
      { totalQuantity: 5, selectedQuantity: 2, orderId: 101 },
      40,
    );

    expect(createdOrders[0]).toMatchObject({
      quantity: 2,
      paidQuantity: 2,
      discountAmount: 20,
    });
    expect(order.quantity).toBe(3);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid custom total %p',
    async (total) => {
      const order = makeOrder();
      const { service, orderModel } = buildService({
        foundDiscount: customDiscount,
        order,
      });

      await expect(
        applyCustomDiscount(
          service,
          { totalQuantity: 3, selectedQuantity: 1, orderId: 101 },
          total,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(orderModel.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(order.save).not.toHaveBeenCalled();
    },
  );

  it('rejects a custom total greater than the selected units total', async () => {
    const order = makeOrder({ unitPrice: 20 });
    const { service, orderModel } = buildService({
      foundDiscount: customDiscount,
      order,
    });

    await expect(
      applyCustomDiscount(
        service,
        { totalQuantity: 3, selectedQuantity: 2, orderId: 101 },
        40.01,
      ),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    expect(orderModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it.each([0, 1.5, 4])(
    'rejects invalid affected quantity %p',
    async (selectedQuantity) => {
      const order = makeOrder({ quantity: 3 });
      const { service, orderModel } = buildService({
        foundDiscount: customDiscount,
        order,
      });

      await expect(
        applyCustomDiscount(
          service,
          { totalQuantity: 3, selectedQuantity, orderId: 101 },
          10,
        ),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(orderModel.findByIdAndUpdate).not.toHaveBeenCalled();
    },
  );

  it('rejects a stale quantity after units have been paid without writing', async () => {
    const order = makeOrder({ quantity: 5, paidQuantity: 3 });
    const { service, orderModel } = buildService({
      foundDiscount: customDiscount,
      order,
    });

    await expect(
      applyCustomDiscount(
        service,
        { totalQuantity: 5, selectedQuantity: 3, orderId: 101 },
        10,
      ),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    expect(orderModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(order.save).not.toHaveBeenCalled();
  });

  it('requires a note when the custom definition requires one', async () => {
    const order = makeOrder();
    const { service, orderModel } = buildService({
      foundDiscount: { ...customDiscount, isNoteRequired: true },
      order,
    });

    await expect(
      applyCustomDiscount(
        service,
        { totalQuantity: 3, selectedQuantity: 1, orderId: 101 },
        5,
        '   ',
      ),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    expect(orderModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('defaults a custom discount without channel flags to store orders', async () => {
    const order = makeOrder();
    const { service, createdOrders } = buildService({
      foundDiscount: {
        ...customDiscount,
        isStoreOrder: false,
        isOnlineOrder: false,
      },
      order,
      table: { _id: 7, isOnlineSale: false },
    });

    await applyCustomDiscount(
      service,
      { totalQuantity: 3, selectedQuantity: 1, orderId: 101 },
      5,
    );

    expect(createdOrders[0]).toMatchObject({
      discount: customDiscount._id,
      discountAmount: 5,
      quantity: 1,
    });
  });

  it.each([
    {
      label: 'store-only discount on an online order',
      discount: { isStoreOrder: true, isOnlineOrder: false },
      table: { _id: 7, isOnlineSale: true },
    },
    {
      label: 'online-only discount on a store order',
      discount: { isStoreOrder: false, isOnlineOrder: true },
      table: { _id: 7, isOnlineSale: false },
    },
  ])('rejects $label', async ({ discount, table }) => {
    const order = makeOrder();
    const { service, orderModel } = buildService({
      foundDiscount: { ...customDiscount, ...discount },
      order,
      table,
    });

    await expect(
      applyCustomDiscount(
        service,
        { totalQuantity: 3, selectedQuantity: 1, orderId: 101 },
        5,
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'Custom discount is not available for this sales channel',
    });
    expect(orderModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects applying a custom discount to an already discounted order', async () => {
    const order = makeOrder({ discount: 12 });
    const { service, orderModel } = buildService({
      foundDiscount: customDiscount,
      order,
    });

    await expect(
      applyCustomDiscount(
        service,
        { totalQuantity: 3, selectedQuantity: 1, orderId: 101 },
        5,
      ),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    expect(orderModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    ['deleted', { ...customDiscount, status: 'deleted' }],
    ['non-custom', { ...customDiscount, isCustom: false }],
  ])('rejects a %s definition in the custom path', async (_name, definition) => {
    const order = makeOrder();
    const { service, orderModel } = buildService({
      foundDiscount: definition,
      order,
    });

    await expect(
      applyCustomDiscount(
        service,
        { totalQuantity: 3, selectedQuantity: 1, orderId: 101 },
        5,
      ),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    expect(orderModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('preserves the existing fixed amount path', async () => {
    const order = makeOrder({ quantity: 2 });
    const { service, orderModel } = buildService({
      foundDiscount: { _id: 60, isCustom: false, amount: 15 },
      order,
    });

    await service.createOrderForDiscount(
      {} as any,
      [{ totalQuantity: 2, selectedQuantity: 2, orderId: 101 }],
      60,
      undefined,
      15,
    );

    expect(orderModel.findByIdAndUpdate).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ discountAmount: 7.5 }),
      { new: true },
    );
  });

  it('preserves the existing fixed percentage path', async () => {
    const order = makeOrder({ quantity: 2 });
    const { service, orderModel } = buildService({
      foundDiscount: { _id: 61, isCustom: false, percentage: 25 },
      order,
    });

    await service.createOrderForDiscount(
      {} as any,
      [{ totalQuantity: 2, selectedQuantity: 2, orderId: 101 }],
      61,
      25,
    );

    expect(orderModel.findByIdAndUpdate).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ discountPercentage: 25 }),
      { new: true },
    );
  });
});

describe('OrderController custom discount locks', () => {
  const getLockOptions = (method: keyof OrderController) =>
    Reflect.getMetadata(
      RACE_CONDITION_LOCK_METADATA,
      OrderController.prototype[method],
    );

  it('locks every selected order while applying a discount', () => {
    const options = getLockOptions('createOrderForDiscount');

    expect(
      options.key({
        body: { orders: [{ orderId: 22 }, { orderId: 11 }, { orderId: 22 }] },
      }),
    ).toEqual([
      `${RedisKeys.OrderLock}:11`,
      `${RedisKeys.OrderLock}:22`,
    ]);
  });

  it('serializes create and update discount configuration with one lock', () => {
    const createOptions = getLockOptions('createDiscount');
    const updateOptions = getLockOptions('updateDiscount');

    expect(createOptions.key).toBe(`${RedisKeys.Discounts}:custom-config`);
    expect(updateOptions.key).toBe(createOptions.key);
  });

  it('uses the same order locks while creating a payment collection', () => {
    const options = getLockOptions('createCollection');

    expect(
      options.key({
        body: {
          orders: [{ order: 22 }],
          newOrders: [{ _id: 11 }, { _id: 22 }],
        },
      }),
    ).toEqual([
      `${RedisKeys.OrderLock}:11`,
      `${RedisKeys.OrderLock}:22`,
    ]);
  });

  it('uses the same order locks while cancelling a payment collection', () => {
    const options = getLockOptions('updateCollection');

    expect(
      options.key({
        body: { newOrders: [{ _id: 22 }, { _id: 11 }] },
        params: { id: 90 },
      }),
    ).toEqual([
      `${RedisKeys.OrderLock}:11`,
      `${RedisKeys.OrderLock}:22`,
    ]);
  });
});
