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
    gameplays = [] as unknown[],
    calls = [] as unknown[],
  }) {
    const userModel = model(users);
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
      role: { $in: [RoleEnum.GAMEMASTER, RoleEnum.GAMEMANAGER] },
    });
  });

  it('excludes people explaining, on a break or middleman', async () => {
    const { service } = build({
      visits: ['free', 'explaining', 'break', 'middleman'].map((id) =>
        visit(id),
      ),
      users: ['free', 'explaining', 'break', 'middleman'].map((id) => gm(id)),
      explaining: [{ user: 'explaining' }],
      breaks: [{ user: 'break' }],
      middlemen: [{ user: 'middleman' }],
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
      type: 'GAMEMASTERCALL',
      assignedTo: 'ali',
      finishHour: { $exists: false },
    });
  });

  it('refuses when the game master already has an open call', async () => {
    const { service, buttonCallModel } = build(true);

    await expect(service.claim({ _id: 'ali' } as never, 7)).rejects.toThrow(
      'You already have an assigned game master call',
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
  function build() {
    const buttonCallModel = {
      findById: jest.fn(() =>
        query({
          _id: 7,
          type: 'GAMEMASTERCALL',
          assignedTo: 'ali',
          gmCallReason: 'RECOMMENDATION',
        }),
      ),
      findOneAndUpdate: jest.fn(async () => ({ _id: 7, declinedBy: ['ali'] })),
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
    );
    jest.spyOn(service, 'assign').mockResolvedValue(null);
    return { service, buttonCallModel };
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
});
