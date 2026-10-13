jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { OrderStatus } from './order.dto';
import { OrderService } from './order.service';

type Row = Record<string, unknown>;

// OrderService with only what these flows touch.
function build({
  notes = [] as Row[],
  waiting = [] as Row[],
  foodInPreparation = false,
}) {
  const leanQuery = (rows: unknown) => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.lean = async () => rows;
    return q;
  };
  const orderModel = {
    find: jest.fn(async (filter: Row) =>
      filter.waitsForFood ? waiting : waiting.map((o) => ({ ...o })),
    ),
    exists: jest.fn(async () => (foodInPreparation ? { _id: 1 } : null)),
    updateMany: jest.fn(async () => undefined),
  };
  const buttonCallService = {
    closeOrderReadyCallIfDelivered: jest.fn(async () => null),
  };
  const websocketGateway = { emitOrderUpdated: jest.fn(async () => undefined) };
  const service = Object.assign(Object.create(OrderService.prototype), {
    orderModel,
    orderNotesModel: { find: jest.fn(() => leanQuery(notes)) },
    buttonCallService,
    websocketGateway,
    logger: { error: jest.fn() },
  });
  return { service, orderModel, buttonCallService, websocketGateway };
}

const user = { _id: 'ali' };

describe('"Served with food" order notes', () => {
  const hold = async (order: Row, notes: Row[]) => {
    const { service } = build({ notes });
    service.holdForFoodIfRequested(
      order,
      await service.findServedWithFoodNotes(),
    );
    return order;
  };
  const withFoodNote = {
    note: ' Yemekle beraber gelsin ',
    isServedWithFood: true,
  };

  it('keeps a ready-right-away order waiting for the food', async () => {
    const order = await hold(
      {
        table: 3,
        status: OrderStatus.READYTOSERVE,
        note: 'Buzlu, Yemekle beraber gelsin',
      },
      [withFoodNote],
    );

    expect(order).toMatchObject({
      status: OrderStatus.PENDING,
      waitsForFood: true,
    });
  });

  it('leaves orders without the note alone', async () => {
    const order = await hold(
      { table: 3, status: OrderStatus.READYTOSERVE, note: 'Buzlu' },
      [withFoodNote],
    );

    expect(order.status).toBe(OrderStatus.READYTOSERVE);
    expect(order.waitsForFood).toBeUndefined();
  });

  it('leaves orders the bar prepares anyway alone', async () => {
    const order = await hold(
      {
        table: 3,
        status: OrderStatus.PENDING,
        note: 'Yemekle beraber gelsin',
      },
      [withFoodNote],
    );

    expect(order.waitsForFood).toBeUndefined();
  });
});

describe('orders waiting for the food', () => {
  const cola = {
    _id: 1,
    table: 3,
    kitchen: 'bar',
    status: OrderStatus.PENDING,
    waitsForFood: true,
  };
  const food = (status: string, table = 3) => ({
    _id: 2,
    table,
    kitchen: 'mutfak',
    status,
  });

  it("get ready with the table's food", async () => {
    const { service, orderModel, websocketGateway } = build({
      waiting: [cola],
    });

    await service.releaseOrdersWaitingForFood(user, [
      food(OrderStatus.READYTOSERVE),
    ]);

    expect(orderModel.exists).toHaveBeenCalledWith(
      expect.objectContaining({ table: 3, kitchen: { $nin: ['bar'] } }),
    );
    expect(orderModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [1] }, status: OrderStatus.PENDING },
      {
        $set: expect.objectContaining({
          status: OrderStatus.READYTOSERVE,
          preparedBy: 'ali',
        }),
      },
    );
    expect(websocketGateway.emitOrderUpdated).toHaveBeenCalled();
  });

  it("wait while some of the table's food is still being prepared", async () => {
    const { service, orderModel } = build({
      waiting: [cola],
      foodInPreparation: true,
    });

    await service.releaseOrdersWaitingForFood(user, [
      food(OrderStatus.READYTOSERVE),
    ]);

    expect(orderModel.updateMany).not.toHaveBeenCalled();
  });

  it('wait when another drink from the bar gets ready', async () => {
    const { service, orderModel } = build({ waiting: [cola] });

    await service.releaseOrdersWaitingForFood(user, [
      { _id: 4, table: 3, kitchen: 'bar', status: OrderStatus.READYTOSERVE },
    ]);

    expect(orderModel.updateMany).not.toHaveBeenCalled();
  });

  it("don't look at orders that didn't get ready", async () => {
    const { service, orderModel } = build({ waiting: [cola] });

    await service.releaseOrdersWaitingForFood(user, [food(OrderStatus.SERVED)]);

    expect(orderModel.find).not.toHaveBeenCalled();
  });
});

describe('after order statuses change', () => {
  it("asks to close the bar's order ready call where orders were delivered", async () => {
    const { service, buttonCallService } = build({});

    await service.afterStatusChanged(user, [
      { _id: 1, table: 3, location: 1, status: OrderStatus.SERVED },
      { _id: 2, table: 4, location: 1, status: OrderStatus.SERVED },
      { _id: 3, table: 5, location: 2, status: OrderStatus.READYTOSERVE },
    ]);

    expect(buttonCallService.closeOrderReadyCallIfDelivered.mock.calls).toEqual(
      [[1, user]],
    );
  });
});
