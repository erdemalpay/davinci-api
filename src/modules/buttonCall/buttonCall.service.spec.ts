jest.mock('../location/location.service', () => ({
  LocationService: class LocationService {},
}));
jest.mock('../activity/activity.service', () => ({
  ActivityService: class ActivityService {},
}));
jest.mock('./buttonCall.assignment.service', () => ({
  ButtonCallAssignmentService: class ButtonCallAssignmentService {},
}));
jest.mock('./unmetExplanationRequest.service', () => ({
  UnmetExplanationRequestService: class UnmetExplanationRequestService {},
}));

import { ButtonCallService } from './buttonCall.service';
import { ButtonCallTypeEnum } from './dto/create-buttonCall.dto';

describe('ButtonCallService frees the assignee', () => {
  function build(call: Record<string, unknown> | null) {
    const doc = call && {
      ...call,
      set: jest.fn(),
      save: jest.fn(async () => undefined),
    };
    const buttonCallModel = {
      findOne: jest.fn(async () => doc),
      findById: jest.fn(async () => doc),
      findByIdAndDelete: jest.fn(async () => doc),
    };
    const assignment = { handleStaffAvailabilityChanged: jest.fn() };
    const service = new ButtonCallService(
      buttonCallModel as never,
      {} as never,
      { emitButtonCallChanged: jest.fn() } as never,
      { addActivity: jest.fn(async () => undefined) } as never,
      {} as never,
      assignment as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, assignment, buttonCallModel };
  }

  const closeDto = { tableName: '5', location: 1, hour: '12:30:00' };

  it('assigns waiting calls right away when a GM closes their call', async () => {
    const { service, assignment } = build({
      _id: 1,
      type: ButtonCallTypeEnum.GAMEMASTERCALL,
      assignedTo: 'mert',
      startHour: '12:20:00',
    });

    await service.close(null, closeDto);

    expect(assignment.handleStaffAvailabilityChanged).toHaveBeenCalledTimes(1);
  });

  it('does nothing extra for an unassigned GM call', async () => {
    const { service, assignment } = build({
      _id: 1,
      type: ButtonCallTypeEnum.GAMEMASTERCALL,
      startHour: '12:20:00',
    });

    await service.close(null, closeDto);

    expect(assignment.handleStaffAvailabilityChanged).not.toHaveBeenCalled();
  });

  it('does nothing extra for an unassigned service call', async () => {
    const { service, assignment } = build({
      _id: 1,
      type: ButtonCallTypeEnum.ORDERCALL,
      startHour: '12:20:00',
    });

    await service.close(null, closeDto);

    expect(assignment.handleStaffAvailabilityChanged).not.toHaveBeenCalled();
  });

  it('frees the assignee of a service call too', async () => {
    const { service, assignment } = build({
      _id: 1,
      type: ButtonCallTypeEnum.ORDERCALL,
      startHour: '12:20:00',
      assignedTo: 'ceren',
    });

    await service.close(null, closeDto);

    expect(assignment.handleStaffAvailabilityChanged).toHaveBeenCalledTimes(1);
  });

  it('frees the assignee when an order closes their service call', async () => {
    const { service, assignment, buttonCallModel } = build({
      _id: 1,
      type: ButtonCallTypeEnum.ORDERCALL,
      assignedTo: 'ceren',
      startHour: '12:20:00',
    });
    const doc = await buttonCallModel.findOne();
    buttonCallModel.findOne.mockReturnValueOnce({
      sort: async () => doc,
    } as never);

    await service.closeOrderCall({ name: '5', location: 1 } as never, null);

    expect(assignment.handleStaffAvailabilityChanged).toHaveBeenCalledTimes(1);
  });

  it('frees the assignee when an open GM call is deleted', async () => {
    const { service, assignment } = build({
      _id: 1,
      type: ButtonCallTypeEnum.GAMEMASTERCALL,
      assignedTo: 'mert',
    });

    await service.remove(1);

    expect(assignment.handleStaffAvailabilityChanged).toHaveBeenCalledTimes(1);
  });
});

describe('ButtonCallService closes the call when a game is added', () => {
  const event = {
    location: 1,
    date: '2026-10-09',
    tableName: '5',
    mentor: 'mert',
  };

  function build(openCall: boolean) {
    const doc = openCall
      ? {
          _id: 3,
          type: ButtonCallTypeEnum.GAMEMASTERCALL,
          assignedTo: 'ali',
          startHour: '12:20:00',
          set: jest.fn(),
          save: jest.fn(async () => undefined),
        }
      : null;
    const buttonCallModel = {
      exists: jest.fn(async () => (doc ? { _id: 3 } : null)),
      findOne: jest.fn(async () => doc),
    };
    const mentor = { _id: 'mert' };
    const service = new ButtonCallService(
      buttonCallModel as never,
      {} as never,
      { emitButtonCallChanged: jest.fn() } as never,
      { addActivity: jest.fn(async () => undefined) } as never,
      {} as never,
      { handleStaffAvailabilityChanged: jest.fn() } as never,
      { findById: jest.fn(async () => mentor) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, buttonCallModel, doc };
  }

  it("closes the table's open GM call in the mentor's name", async () => {
    const { service, buttonCallModel, doc } = build(true);

    await service.closeCallOnGameplayAdded(event);

    expect(buttonCallModel.exists).toHaveBeenCalledWith({
      tableName: '5',
      location: 1,
      date: '2026-10-09',
      type: ButtonCallTypeEnum.GAMEMASTERCALL,
      finishHour: { $exists: false },
    });
    expect(buttonCallModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ type: ButtonCallTypeEnum.GAMEMASTERCALL }),
    );
    expect(doc!.set).toHaveBeenCalledWith(
      expect.objectContaining({ cancelledBy: 'mert' }),
    );
  });

  it('does nothing when the table has no open GM call', async () => {
    const { service, buttonCallModel } = build(false);

    await service.closeCallOnGameplayAdded(event);

    expect(buttonCallModel.findOne).not.toHaveBeenCalled();
  });
});

describe('ButtonCallService queue', () => {
  const lean = (rows: unknown) => ({
    select: () => ({
      sort: () => ({ lean: () => ({ exec: async () => rows }) }),
      lean: async () => rows,
    }),
  });

  function build(calls: unknown[]) {
    const service = new ButtonCallService(
      { find: jest.fn(() => lean(calls)) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        find: jest.fn(() =>
          lean([
            { _id: 'ayse', name: 'Ayşe Yılmaz' },
            { _id: 'mert', name: 'Mert' },
          ]),
        ),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return service;
  }

  const call = (
    _id: number,
    tableName: string,
    type: ButtonCallTypeEnum,
    assignedTo?: string,
  ) => ({ _id, tableName, type, createdAt: new Date(), assignedTo });

  it('tells the table the first name of whoever is coming', async () => {
    const service = build([
      call(1, '3', ButtonCallTypeEnum.GAMEMASTERCALL, 'mert'),
      {
        ...call(2, '5', ButtonCallTypeEnum.GAMEMASTERCALL, 'ayse'),
        gmCallReason: 'QUESTION',
      },
      call(3, '5', ButtonCallTypeEnum.ORDERCALL),
    ]);

    const queue = await service.getTodayQueuePositionsByType({
      tableName: '5',
      location: 1,
    });

    expect(queue[ButtonCallTypeEnum.GAMEMASTERCALL]).toMatchObject({
      isQueued: true,
      position: 2,
      assignedToName: 'Ayşe',
      gmCallReason: 'QUESTION',
    });
    // Not assigned yet: no name.
    expect(queue[ButtonCallTypeEnum.ORDERCALL].assignedToName).toBeUndefined();
  });
});

describe('ButtonCallService TV screen', () => {
  const lean = (rows: unknown) => ({
    select: () => ({ lean: async () => rows }),
  });

  it("shows each call's assignee first name and game", async () => {
    const service = new ButtonCallService(
      {
        find: jest.fn(() =>
          lean([
            {
              _id: 1,
              tableName: '5',
              type: ButtonCallTypeEnum.GAMEMASTERCALL,
              assignedTo: 'ayse',
              game: 10,
            },
            { _id: 2, tableName: '6', type: ButtonCallTypeEnum.ORDERCALL },
          ]),
        ),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        find: jest.fn(() => lean([{ _id: 'ayse', name: 'Ayşe Yılmaz' }])),
      } as never,
      {} as never,
      { find: jest.fn(() => lean([{ _id: 10, name: 'Catan' }])) } as never,
      {} as never,
      {} as never,
    );

    const calls = await service.findForScreen(1);

    expect(calls[0]).toMatchObject({
      assignedToName: 'Ayşe',
      gameName: 'Catan',
    });
    expect(calls[1].gameName).toBeUndefined();
  });
});

describe('ButtonCallService order calls', () => {
  const callDoc = (call: Record<string, unknown>) => ({
    startHour: '12:00:00',
    ...call,
    set: jest.fn(),
    save: jest.fn(async () => undefined),
  });
  const leanQuery = (rows: unknown) => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.lean = async () => rows;
    return q;
  };

  function build({
    calls = {} as Record<string, ReturnType<typeof callDoc>>,
    readyOrderLeft = false,
    barKitchens = [{ _id: 'bar' }] as unknown[],
  }) {
    const findOne = jest.fn((filter: { tableName?: string }) => {
      const doc = filter.tableName
        ? calls[filter.tableName] ?? null
        : Object.values(calls)[0] ?? null;
      // closeOrderCall sorts the query, closeOrderReadyCallIfDelivered
      // awaits it directly.
      const result = Promise.resolve(doc) as Promise<unknown> & {
        sort?: () => Promise<unknown>;
      };
      result.sort = () => Promise.resolve(doc);
      return result;
    });
    const orderModel = {
      exists: jest.fn(async () => (readyOrderLeft ? { _id: 1 } : null)),
    };
    const kitchenModel = { find: jest.fn(() => leanQuery(barKitchens)) };
    const assignment = { handleStaffAvailabilityChanged: jest.fn() };
    const service = new ButtonCallService(
      { findOne } as never,
      {} as never,
      { emitButtonCallChanged: jest.fn() } as never,
      { addActivity: jest.fn(async () => undefined) } as never,
      {} as never,
      assignment as never,
      {} as never,
      {} as never,
      {} as never,
      orderModel as never,
      kitchenModel as never,
    );
    return { service, findOne, orderModel, assignment };
  }

  const user = { _id: 'ali' } as never;

  describe("the bar's order ready call", () => {
    it('closes once no bar order of today is left ready to serve', async () => {
      const call = callDoc({
        _id: 1,
        tableName: '44',
        type: ButtonCallTypeEnum.ORDERREADYCALL,
        assignedTo: 'ayse',
      });
      const { service, orderModel, assignment } = build({
        calls: { '44': call },
      });

      const closed = await service.closeOrderReadyCallIfDelivered(1, user);

      expect(closed).toBe(call);
      expect(call.set).toHaveBeenCalledWith(
        expect.objectContaining({ cancelledBy: 'ali' }),
      );
      expect(orderModel.exists).toHaveBeenCalledWith(
        expect.objectContaining({
          location: 1,
          status: 'ready_to_serve',
          kitchen: { $in: ['bar'] },
        }),
      );
      // Whoever had the call is free for the next one.
      expect(assignment.handleStaffAvailabilityChanged).toHaveBeenCalled();
    });

    it('stays open while a bar order is still ready to serve', async () => {
      const call = callDoc({
        _id: 1,
        tableName: '44',
        type: ButtonCallTypeEnum.ORDERREADYCALL,
      });
      const { service } = build({
        calls: { '44': call },
        readyOrderLeft: true,
      });

      expect(await service.closeOrderReadyCallIfDelivered(1, user)).toBeNull();
      expect(call.set).not.toHaveBeenCalled();
    });

    it('checks every kitchen when there is no bar kitchen', async () => {
      const call = callDoc({
        _id: 1,
        tableName: '44',
        type: ButtonCallTypeEnum.ORDERREADYCALL,
      });
      const { service, orderModel } = build({
        calls: { '44': call },
        barKitchens: [],
      });

      await service.closeOrderReadyCallIfDelivered(1, user);

      expect(orderModel.exists).toHaveBeenCalledWith(
        expect.not.objectContaining({ kitchen: expect.anything() }),
      );
    });

    it('does nothing without an open order ready call', async () => {
      const { service, orderModel } = build({});

      expect(await service.closeOrderReadyCallIfDelivered(1, user)).toBeNull();
      expect(orderModel.exists).not.toHaveBeenCalled();
    });
  });

  describe("a table's service call when an order is taken", () => {
    const serviceCall = (tableName: string) =>
      callDoc({
        _id: tableName,
        tableName,
        type: ButtonCallTypeEnum.ORDERCALL,
      });

    it('closes the call of the table itself', async () => {
      const call = serviceCall('5');
      const { service } = build({ calls: { '5': call } });

      const closed = await service.closeOrderCall(
        { name: '5', location: 1, type: 'normal' } as never,
        user,
      );

      expect(closed).toEqual([call]);
    });

    it('on an activity table, only closes the calls of the tables the orders are for', async () => {
      const calls = {
        '12': serviceCall('12'),
        '13': serviceCall('13'),
        Etkinlik: serviceCall('Etkinlik'),
      };
      const { service } = build({ calls });

      const closed = await service.closeOrderCall(
        { name: 'Etkinlik', location: 1, type: 'activity' } as never,
        user,
        ['12', '12', undefined],
      );

      expect(closed).toEqual([calls['12']]);
      expect(calls['13'].set).not.toHaveBeenCalled();
      expect(calls.Etkinlik.set).not.toHaveBeenCalled();
    });
  });
});
