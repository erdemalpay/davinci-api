import { RoleEnum } from '../user/user.dto';
import { hourToSeconds } from './buttonCall.assignment';
import { ButtonCallAssignmentService } from './buttonCall.assignment.service';
import { DeclineReasonEnum } from './dto/create-buttonCall.dto';

// Minimal stand-in for a mongoose query: every builder method returns the
// query and `lean()` resolves to the given rows.
const query = (rows: unknown) => {
  const q: Record<string, unknown> = {};
  for (const method of ['select', 'sort']) {
    q[method] = () => q;
  }
  q.lean = async () => rows;
  return q;
};

const model = (rows: unknown, single?: unknown) => ({
  find: jest.fn(() => query(rows)),
  findOne: jest.fn(() => query(single ?? null)),
  findById: jest.fn(() => query(single ?? null)),
});

describe('ButtonCallAssignmentService.findCandidates', () => {
  const date = '2026-10-05';
  const location = 1;

  function build({
    visits = [] as unknown[],
    users = [] as unknown[],
    explaining = [] as unknown[],
    breaks = [] as unknown[],
    middlemen = [] as unknown[],
    shift = null as unknown,
    locationDoc = null as unknown,
    gameplays = [] as unknown[],
    calls = [] as unknown[],
    hasWaitingOrder = false,
  }) {
    const userModel = model(users);
    const locationModel = model([], locationDoc);
    const service = new ButtonCallAssignmentService(
      model(calls) as never,
      model(visits) as never,
      userModel as never,
      model(breaks) as never,
      model(middlemen) as never,
      model(explaining) as never,
      model(gameplays) as never,
      model([], shift) as never,
      model([]) as never,
      { emitButtonCallChanged: jest.fn() } as never,
      locationModel as never,
      {
        exists: jest.fn(async () => (hasWaitingOrder ? { _id: 1 } : null)),
      } as never,
      { emit: jest.fn() } as never,
    );
    return { service, userModel };
  }

  const gm = (id: string, games: number[] = []) => ({
    _id: id,
    userGames: games.map((game) => ({ game })),
  });
  const visit = (user: string, startHour = '10:00:00') => ({
    user,
    startHour,
  });

  it('only considers active game masters and game managers in the cafe', async () => {
    const { service, userModel } = build({
      visits: [visit('ali'), visit('ayse')],
      users: [gm('ali'), gm('ayse')],
    });

    await service.findCandidates(location, date, '12:00:00', []);

    expect(userModel.find).toHaveBeenCalledWith({
      _id: { $in: ['ali', 'ayse'] },
      active: true,
      // Managers only on a day they asked for game master calls.
      $or: [
        { role: { $in: [RoleEnum.GAMEMASTER, RoleEnum.GAMEMANAGER] } },
        {
          role: RoleEnum.MANAGER,
          'settings.includeInGameAssignmentsDate': date,
        },
      ],
    });
  });

  it('excludes people explaining or on a break', async () => {
    const { service } = build({
      visits: ['free', 'explaining', 'break'].map((id) => visit(id)),
      users: ['free', 'explaining', 'break'].map((id) => gm(id)),
      explaining: [{ user: 'explaining' }],
      breaks: [{ user: 'break' }],
    });

    const candidates = await service.findCandidates(
      location,
      date,
      '12:00:00',
      [],
    );

    expect(candidates.map((c) => c.userId)).toEqual(['free']);
  });

  it('keeps service staff of the current slot, flagged as last resort', async () => {
    const { service } = build({
      visits: [visit('free'), visit('service')],
      users: [gm('free'), gm('service')],
      shift: { shifts: [{ shift: '10:00', chefUser: 'service' }] },
    });

    const candidates = await service.findCandidates(
      location,
      date,
      '12:00:00',
      [],
    );
    const byId = Object.fromEntries(candidates.map((c) => [c.userId, c]));

    expect(byId.free.isServiceStaff).toBe(false);
    expect(byId.service.isServiceStaff).toBe(true);
  });

  it('never considers people outside operation, not even as a last resort', async () => {
    const { service } = build({
      visits: [visit('outside'), visit('outside-service')],
      users: [gm('outside'), gm('outside-service')],
      shift: {
        shifts: [
          {
            shift: '10:00',
            chefUser: 'outside-service',
            outsideOperationUsers: ['outside', 'outside-service'],
          },
        ],
      },
    });

    const candidates = await service.findCandidates(
      location,
      date,
      '12:00:00',
      [],
    );

    expect(candidates).toEqual([]);
  });

  it('treats service staff and outside operation as set for the whole day', async () => {
    // Ceren (service staff) and Kemal (outside operation) are marked on the
    // 10:00 slot; both roles hold for the whole day, whatever the hour.
    const { service } = build({
      visits: [visit('ceren'), visit('kemal'), visit('mert')],
      users: [gm('ceren'), gm('kemal'), gm('mert')],
      shift: {
        shifts: [
          {
            shift: '10:00',
            user: ['ceren', 'kemal'],
            chefUser: 'ceren',
            outsideOperationUsers: ['kemal'],
          },
          { shift: '14:00', user: ['mert'] },
        ],
      },
      locationDoc: {
        shifts: [
          { shift: '10:00', shiftEndHour: '18:00' },
          { shift: '14:00', shiftEndHour: '22:00' },
        ],
      },
    });

    const candidates = await service.findCandidates(
      location,
      date,
      '15:00:00',
      [],
    );
    const byId = Object.fromEntries(candidates.map((c) => [c.userId, c]));

    expect(Object.keys(byId).sort()).toEqual(['ceren', 'mert']);
    expect(byId.ceren.isServiceStaff).toBe(true);
    expect(byId.mert.isServiceStaff).toBe(false);
  });

  it('excludes people who declined the call', async () => {
    const { service } = build({
      visits: [visit('ali'), visit('ayse')],
      users: [gm('ali'), gm('ayse')],
    });

    const candidates = await service.findCandidates(
      location,
      date,
      '12:00:00',
      ['ali'],
    );

    expect(candidates.map((c) => c.userId)).toEqual(['ayse']);
  });

  it('uses the latest explanation or assignment as last activity, check-in otherwise', async () => {
    const { service } = build({
      visits: [visit('explained', '10:00:00'), visit('new', '16:00:00')],
      users: [gm('explained', [5]), gm('new')],
      gameplays: [
        { mentor: 'explained', startHour: '11:00' },
        { mentor: 'explained', startHour: '13:30' },
      ],
      calls: [
        {
          assignedTo: 'explained',
          assignedHour: '14:15:00',
          finishHour: '14:20:00',
        },
      ],
    });

    const candidates = await service.findCandidates(
      location,
      date,
      '17:00:00',
      [],
    );
    const byId = Object.fromEntries(candidates.map((c) => [c.userId, c]));

    expect(byId.explained.lastActivity).toBe(hourToSeconds('14:15:00'));
    expect(byId.explained.gameplayCountToday).toBe(2);
    expect(byId.explained.knownGames.has(5)).toBe(true);
    expect(byId.new.lastActivity).toBe(hourToSeconds('16:00:00'));
  });

  it('also considers the service role for service calls, as service staff', async () => {
    const { service } = build({
      visits: [visit('gm'), visit('waiter')],
      users: [gm('gm'), { ...gm('waiter'), role: RoleEnum.SERVICE }],
    });

    const candidates = await service.findCandidates(
      location,
      date,
      '12:00:00',
      [],
      'ORDERCALL' as never,
    );
    const byId = Object.fromEntries(candidates.map((c) => [c.userId, c]));

    expect(byId.waiter.isServiceStaff).toBe(true);
    expect(byId.gm.isServiceStaff).toBe(false);
  });

  describe('tiers', () => {
    const withRole = (id: string, role: RoleEnum) => ({ ...gm(id), role });
    const tiersOf = (candidates: { userId: string; tier?: number }[]) =>
      Object.fromEntries(candidates.map((c) => [c.userId, c.tier]));

    it('game master calls: GMs, game manager, service staff, then managers and last resorts', async () => {
      const { service } = build({
        visits: [
          'gm',
          'gmanager',
          'service',
          'manager',
          'middleman',
          'outside',
        ].map((id) => visit(id)),
        users: [
          withRole('gm', RoleEnum.GAMEMASTER),
          withRole('gmanager', RoleEnum.GAMEMANAGER),
          withRole('service', RoleEnum.GAMEMASTER),
          withRole('manager', RoleEnum.MANAGER),
          withRole('middleman', RoleEnum.GAMEMASTER),
          withRole('outside', RoleEnum.GAMEMANAGER),
        ],
        middlemen: [{ user: 'middleman' }],
        shift: {
          shifts: [
            {
              shift: '10:00',
              chefUser: 'service',
              outsideOperationUsers: ['outside'],
            },
          ],
        },
      });

      const candidates = await service.findCandidates(
        location,
        date,
        '12:00:00',
        [],
      );

      expect(tiersOf(candidates)).toEqual({
        gm: 0,
        gmanager: 1,
        service: 2,
        manager: 3,
        middleman: 3,
        outside: 3,
      });
    });

    it('service calls: service staff, GMs, game manager, baristas, then the bar chef', async () => {
      const { service, userModel } = build({
        visits: [
          'waiter',
          'chef-gm',
          'gm',
          'gmanager',
          'barista',
          'barchef',
        ].map((id) => visit(id)),
        users: [
          withRole('waiter', RoleEnum.SERVICE),
          withRole('chef-gm', RoleEnum.GAMEMASTER),
          withRole('gm', RoleEnum.GAMEMASTER),
          withRole('gmanager', RoleEnum.GAMEMANAGER),
          withRole('barista', RoleEnum.BARISTA),
          withRole('barchef', RoleEnum.BARCHEF),
        ],
        shift: { shifts: [{ shift: '10:00', chefUser: 'chef-gm' }] },
      });

      const candidates = await service.findCandidates(
        location,
        date,
        '12:00:00',
        [],
        'ORDERCALL' as never,
      );

      expect(userModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          role: {
            $in: [
              RoleEnum.SERVICE,
              RoleEnum.GAMEMASTER,
              RoleEnum.GAMEMANAGER,
              RoleEnum.BARISTA,
              RoleEnum.BARCHEF,
            ],
          },
        }),
      );
      expect(tiersOf(candidates)).toEqual({
        waiter: 0,
        'chef-gm': 0,
        gm: 1,
        gmanager: 2,
        barista: 3,
        barchef: 4,
      });
    });

    it('leaves baristas out of service calls while an order is waiting', async () => {
      const { service } = build({
        visits: [visit('barista'), visit('barista-service')],
        users: [
          withRole('barista', RoleEnum.BARISTA),
          withRole('barista-service', RoleEnum.BARISTA),
        ],
        shift: { shifts: [{ shift: '10:00', chefUser: 'barista-service' }] },
        hasWaitingOrder: true,
      });

      const candidates = await service.findCandidates(
        location,
        date,
        '12:00:00',
        [],
        'ORDERCALL' as never,
      );

      // The day's service staff still gets them.
      expect(candidates.map((c) => c.userId)).toEqual(['barista-service']);
    });

    it('gives no service call to the middleman or anyone outside operation', async () => {
      const { service } = build({
        visits: [visit('middleman'), visit('outside')],
        users: [
          withRole('middleman', RoleEnum.GAMEMASTER),
          withRole('outside', RoleEnum.GAMEMANAGER),
        ],
        middlemen: [{ user: 'middleman' }],
        shift: {
          shifts: [{ shift: '10:00', outsideOperationUsers: ['outside'] }],
        },
      });

      const candidates = await service.findCandidates(
        location,
        date,
        '12:00:00',
        [],
        'ORDERCALL' as never,
      );

      expect(candidates).toEqual([]);
    });
  });

  it('excludes people already handling an open call', async () => {
    const { service } = build({
      visits: [visit('ali'), visit('ayse')],
      users: [gm('ali'), gm('ayse')],
      calls: [
        { assignedTo: 'ali', assignedHour: '12:00:00' },
        {
          assignedTo: 'ayse',
          assignedHour: '11:00:00',
          finishHour: '11:10:00',
        },
      ],
    });

    const candidates = await service.findCandidates(
      location,
      date,
      '12:05:00',
      [],
    );

    expect(candidates.map((c) => c.userId)).toEqual(['ayse']);
  });
});

describe('ButtonCallAssignmentService.claim', () => {
  const openCall = {
    _id: 7,
    date: '2026-10-05',
    type: 'GAMEMASTERCALL',
    assignedTo: 'ayse',
  };

  function build(hasOtherOpenCall: boolean) {
    const buttonCallModel = {
      findById: jest.fn(() => query(openCall)),
      exists: jest.fn(async () => (hasOtherOpenCall ? { _id: 3 } : null)),
      findOneAndUpdate: jest.fn(async () => ({
        ...openCall,
        assignedTo: 'ali',
      })),
    };
    const m = () => model([]) as never;
    const service = new ButtonCallAssignmentService(
      buttonCallModel as never,
      m(),
      m(),
      m(),
      m(),
      m(),
      m(),
      m(),
      m(),
      { emitButtonCallChanged: jest.fn() } as never,
      model([], null) as never,
      model([]) as never,
      { emit: jest.fn() } as never,
    );
    return { service, buttonCallModel };
  }

  it('lets a free game master take over a call', async () => {
    const { service, buttonCallModel } = build(false);

    const claimed = await service.claim({ _id: 'ali' } as never, 7);

    expect(claimed.assignedTo).toBe('ali');
    expect(buttonCallModel.exists).toHaveBeenCalledWith({
      _id: { $ne: 7 },
      date: '2026-10-05',
      type: { $in: ['GAMEMASTERCALL', 'ORDERCALL'] },
      assignedTo: 'ali',
      finishHour: { $exists: false },
    });
  });

  it('refuses when the game master already has an open call', async () => {
    const { service, buttonCallModel } = build(true);

    await expect(service.claim({ _id: 'ali' } as never, 7)).rejects.toThrow(
      'You already have an assigned call',
    );
    expect(buttonCallModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('ButtonCallAssignmentService scheduling', () => {
  const build = () => {
    const m = () => model([]) as never;
    return new ButtonCallAssignmentService(
      m(),
      m(),
      m(),
      m(),
      m(),
      m(),
      m(),
      m(),
      m(),
      { emitButtonCallChanged: jest.fn() } as never,
      model([], null) as never,
      model([]) as never,
      { emit: jest.fn() } as never,
    );
  };

  it('assigns pending calls once per burst of availability events', async () => {
    const service = build();
    const run = jest
      .spyOn(service, 'assignPendingCalls')
      .mockResolvedValue(undefined);

    service.handleStaffAvailabilityChanged();
    service.handleStaffAvailabilityChanged();
    service.handleStaffAvailabilityChanged();
    await new Promise((resolve) => setImmediate(resolve));

    expect(run).toHaveBeenCalledTimes(1);

    service.handleStaffAvailabilityChanged();
    await new Promise((resolve) => setImmediate(resolve));

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('runs assignments one at a time', async () => {
    const service = build();
    const events: string[] = [];
    let release!: () => void;
    const firstDone = new Promise<void>((resolve) => (release = resolve));
    jest
      .spyOn(service as never, 'assignNow' as never)
      .mockImplementation((async (id: number) => {
        events.push(`start ${id}`);
        if (id === 1) await firstDone;
        events.push(`end ${id}`);
        return null;
      }) as never);

    const first = service.assign(1);
    const second = service.assign(2);
    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(['start 1']);

    release();
    await Promise.all([first, second]);
    expect(events).toEqual(['start 1', 'end 1', 'start 2', 'end 2']);
  });

  it('keeps assigning after a failed assignment', async () => {
    const service = build();
    jest
      .spyOn(service as never, 'assignNow' as never)
      .mockRejectedValueOnce(new Error('db down') as never)
      .mockResolvedValueOnce(null as never);

    await expect(service.assign(1)).rejects.toThrow('db down');
    await expect(service.assign(2)).resolves.toBeNull();
  });
});

describe('ButtonCallAssignmentService.decline', () => {
  function build(
    callOverrides: Record<string, unknown> = {},
    isAlreadyBusy = false,
  ) {
    const buttonCallModel = {
      findById: jest.fn(() =>
        query({
          _id: 7,
          type: 'GAMEMASTERCALL',
          assignedTo: 'ali',
          gmCallReason: 'RECOMMENDATION',
          ...callOverrides,
        }),
      ),
      findOneAndUpdate: jest.fn(async () => ({
        _id: 7,
        location: 1,
        declinedBy: ['ali'],
      })),
    };
    const breakModel = {
      exists: jest.fn(async () => (isAlreadyBusy ? { _id: 2 } : null)),
      create: jest.fn(async () => ({})),
    };
    const websocketGateway = {
      emitButtonCallChanged: jest.fn(),
      emitBreakChanged: jest.fn(),
    };
    const eventEmitter = { emit: jest.fn() };
    const m = () => model([]) as never;
    const service = new ButtonCallAssignmentService(
      buttonCallModel as never,
      m(),
      m(),
      breakModel as never,
      m(),
      m(),
      m(),
      m(),
      m(),
      websocketGateway as never,
      model([], null) as never,
      model([]) as never,
      eventEmitter as never,
    );
    jest.spyOn(service, 'assign').mockResolvedValue(null);
    return {
      service,
      buttonCallModel,
      breakModel,
      websocketGateway,
      eventEmitter,
    };
  }

  const pushed = (model: { findOneAndUpdate: jest.Mock }) =>
    model.findOneAndUpdate.mock.calls[0][1].$push.assignmentHistory;

  it('records the reason of a decline', async () => {
    const { service, buttonCallModel } = build();

    await service.decline({ _id: 'ali' } as never, 7, {
      reason: DeclineReasonEnum.TAKING_PAYMENT,
    });

    expect(pushed(buttonCallModel)).toMatchObject({
      user: 'ali',
      action: 'declined',
      reason: DeclineReasonEnum.TAKING_PAYMENT,
    });
    expect(pushed(buttonCallModel).note).toBeUndefined();
  });

  it('records the note for "other"', async () => {
    const { service, buttonCallModel } = build();

    await service.decline({ _id: 'ali' } as never, 7, {
      reason: DeclineReasonEnum.OTHER,
      note: '  Depoya gidiyorum ',
    });

    expect(pushed(buttonCallModel)).toMatchObject({
      reason: DeclineReasonEnum.OTHER,
      note: 'Depoya gidiyorum',
    });
  });

  describe('busy state', () => {
    const update = (model: { findOneAndUpdate: jest.Mock }) =>
      model.findOneAndUpdate.mock.calls[0][1];

    it.each([
      DeclineReasonEnum.BREAK,
      DeclineReasonEnum.TAKING_PAYMENT,
      DeclineReasonEnum.WC,
    ])('lets the call come back to them after %s', async (reason) => {
      const { service, buttonCallModel } = build();

      await service.decline({ _id: 'ali' } as never, 7, { reason });

      expect(update(buttonCallModel).$addToSet).toBeUndefined();
    });

    it('never gives the call back after "I don\'t know the game"', async () => {
      const { service, buttonCallModel } = build({ game: 10 });

      await service.decline({ _id: 'ali' } as never, 7, {
        reason: DeclineReasonEnum.DOESNT_KNOW_GAME,
      });

      expect(update(buttonCallModel).$addToSet).toEqual({ declinedBy: 'ali' });
    });

    it('logs it and checks the break warning like any break', async () => {
      const { service, eventEmitter } = build();

      await service.decline({ _id: 'ali' } as never, 7, {
        reason: DeclineReasonEnum.BREAK,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'break.busyStateStartedOnDecline',
        {
          breakRecord: expect.objectContaining({
            user: 'ali',
            location: 1,
            type: 'BREAK',
          }),
        },
      );
    });

    it('puts the person in the matching busy state', async () => {
      const { service, breakModel, websocketGateway } = build();

      await service.decline({ _id: 'ali' } as never, 7, {
        reason: DeclineReasonEnum.TAKING_PAYMENT,
      });

      expect(breakModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user: 'ali',
          location: 1,
          type: 'TAKING_PAYMENT',
        }),
      );
      expect(websocketGateway.emitBreakChanged).toHaveBeenCalled();
    });

    it('keeps the note of "other"', async () => {
      const { service, breakModel } = build();

      await service.decline({ _id: 'ali' } as never, 7, {
        reason: DeclineReasonEnum.OTHER,
        note: ' Depo ',
      });

      expect(breakModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'OTHER', note: 'Depo' }),
      );
    });

    it('does not start another one when already busy', async () => {
      const { service, breakModel } = build({}, true);

      await service.decline({ _id: 'ali' } as never, 7, {
        reason: DeclineReasonEnum.PREPARING_ORDER,
      });

      expect(breakModel.create).not.toHaveBeenCalled();
    });

    it('is not entered for "I don\'t know the game"', async () => {
      const { service, breakModel } = build({
        gmCallReason: 'EXPLANATION',
        game: 10,
      });

      await service.decline({ _id: 'ali' } as never, 7, {
        reason: DeclineReasonEnum.DOESNT_KNOW_GAME,
      });

      expect(breakModel.exists).not.toHaveBeenCalled();
      expect(breakModel.create).not.toHaveBeenCalled();
    });
  });

  describe("doesn't know the game", () => {
    const update = (model: { findOneAndUpdate: jest.Mock }) =>
      model.findOneAndUpdate.mock.calls[0][1];

    it('uses the game of an explanation call', async () => {
      const { service, buttonCallModel } = build({
        gmCallReason: 'EXPLANATION',
        game: 10,
      });

      await service.decline({ _id: 'ali' } as never, 7, {
        reason: DeclineReasonEnum.DOESNT_KNOW_GAME,
      });

      expect(update(buttonCallModel).$push.assignmentHistory).toMatchObject({
        reason: DeclineReasonEnum.DOESNT_KNOW_GAME,
        game: 10,
      });
      expect(update(buttonCallModel).$set).toBeUndefined();
    });

    it('stores the named game on a call without one', async () => {
      const { service, buttonCallModel } = build({ gmCallReason: 'QUESTION' });

      await service.decline({ _id: 'ali' } as never, 7, {
        reason: DeclineReasonEnum.DOESNT_KNOW_GAME,
        game: 30,
      });

      expect(update(buttonCallModel).$set).toEqual({ game: 30 });
      expect(update(buttonCallModel).$push.assignmentHistory.game).toBe(30);
    });

    it('corrects the game of the call', async () => {
      const { service, buttonCallModel } = build({
        gmCallReason: 'EXPLANATION',
        game: 10,
      });

      await service.decline({ _id: 'ali' } as never, 7, {
        reason: DeclineReasonEnum.DOESNT_KNOW_GAME,
        game: 20,
      });

      expect(update(buttonCallModel).$set).toEqual({ game: 20 });
      expect(update(buttonCallModel).$push.assignmentHistory.game).toBe(20);
    });

    it('asks for the game when the call has none', async () => {
      const { service, buttonCallModel } = build();

      await expect(
        service.decline({ _id: 'ali' } as never, 7, {
          reason: DeclineReasonEnum.DOESNT_KNOW_GAME,
        }),
      ).rejects.toThrow('Select the game the table needs help with');
      expect(buttonCallModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});

describe('ButtonCallAssignmentService questions', () => {
  function build(gameplay: unknown, availability: string) {
    const tableModel = {
      findOne: jest.fn(() => {
        const q = query(gameplay ? { gameplays: [1] } : null);
        return { ...q, sort: () => q };
      }),
    };
    const m = () => model([]) as never;
    const service = new ButtonCallAssignmentService(
      m(),
      m(),
      m(),
      m(),
      m(),
      m(),
      model(gameplay ? [gameplay] : []) as never,
      m(),
      tableModel as never,
      { emitButtonCallChanged: jest.fn() } as never,
      model([], null) as never,
      model([]) as never,
      { emit: jest.fn() } as never,
    );
    jest
      .spyOn(service, 'getGameAvailability')
      .mockResolvedValue({ status: availability as never });
    return service;
  }

  const call = (game?: number) => ({
    tableName: '5',
    location: 1,
    date: '2026-10-11',
    gmCallReason: 'QUESTION',
    game,
  });
  const buildRequest = (service: ButtonCallAssignmentService, c: unknown) =>
    (
      service as unknown as { buildRequest: (c: unknown) => Promise<unknown> }
    ).buildRequest(c);

  const activeGameplay = { mentor: 'mert', game: 10, startHour: '12:00' };

  it("asks about the table's game, its explainer first", async () => {
    const service = build(activeGameplay, 'available');

    expect(await buildRequest(service, call())).toEqual({
      reason: 'QUESTION',
      game: 10,
      mentorId: 'mert',
      knowerInCafe: true,
    });
  });

  it('uses the game the table named instead, without the explainer', async () => {
    const service = build(activeGameplay, 'busy');

    expect(await buildRequest(service, call(30))).toEqual({
      reason: 'QUESTION',
      game: 30,
      mentorId: undefined,
      knowerInCafe: true,
    });
  });

  it('lets anyone answer when nobody in the cafe knows the game', async () => {
    const service = build(activeGameplay, 'later');

    expect(await buildRequest(service, call(30))).toMatchObject({
      knowerInCafe: false,
    });
  });

  it("returns the table's game", async () => {
    expect(
      await build(activeGameplay, 'available').getTableGame(1, '5'),
    ).toEqual({ game: 10 });
    expect(await build(null, 'available').getTableGame(1, '5')).toEqual({
      game: null,
    });
  });
});
