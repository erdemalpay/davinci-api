import { RoleEnum } from '../user/user.dto';
import { hourToSeconds } from './buttonCall.assignment';
import { ButtonCallAssignmentService } from './buttonCall.assignment.service';

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

  it('excludes people explaining, on a break, middleman or service staff', async () => {
    const { service } = build({
      visits: ['free', 'explaining', 'break', 'middleman', 'service'].map(
        (id) => visit(id),
      ),
      users: ['free', 'explaining', 'break', 'middleman', 'service'].map((id) =>
        gm(id),
      ),
      explaining: [{ user: 'explaining' }],
      breaks: [{ user: 'break' }],
      middlemen: [{ user: 'middleman' }],
      shift: { shifts: [{ shift: '10:00', chefUser: 'service' }] },
    });

    const candidates = await service.findCandidates(
      location,
      date,
      '12:00:00',
      [],
    );

    expect(candidates.map((c) => c.userId)).toEqual(['free']);
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
    expect(byId.explained.hasOpenAssignment).toBe(false);
    expect(byId.new.lastActivity).toBe(hourToSeconds('16:00:00'));
  });

  it('flags people with an open assigned call', async () => {
    const { service } = build({
      visits: [visit('ali')],
      users: [gm('ali')],
      calls: [{ assignedTo: 'ali', assignedHour: '12:00:00' }],
    });

    const [ali] = await service.findCandidates(location, date, '12:05:00', []);

    expect(ali!.hasOpenAssignment).toBe(true);
  });
});
