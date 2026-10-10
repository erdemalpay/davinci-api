import {
  AssignmentCandidate,
  findOutsideOperationStaff,
  findScheduledStaff,
  findServiceStaff,
  hourToSeconds,
  pickAssignee,
  pickAssigneeServiceStaffLast,
  pickServiceCallAssignee,
  toAssignmentEvents,
} from './buttonCall.assignment';
import { GmCallReasonEnum } from './dto/create-buttonCall.dto';

const candidate = (
  userId: string,
  overrides: Partial<AssignmentCandidate> = {},
): AssignmentCandidate => ({
  userId,
  knownGames: new Set(),
  lastActivity: hourToSeconds('12:00:00'),
  gameplayCountToday: 0,
  ...overrides,
});

describe('pickAssignee', () => {
  it('returns undefined when nobody is available', () => {
    expect(
      pickAssignee([], { reason: GmCallReasonEnum.RECOMMENDATION }),
    ).toBeUndefined();
  });

  it('picks whoever has gone the longest without an action', () => {
    const candidates = [
      candidate('morning', {
        lastActivity: hourToSeconds('15:40:00'),
        gameplayCountToday: 8,
      }),
      candidate('evening', {
        lastActivity: hourToSeconds('16:10:00'),
        gameplayCountToday: 0,
      }),
      candidate('idle', {
        lastActivity: hourToSeconds('15:05:00'),
        gameplayCountToday: 5,
      }),
    ];

    expect(
      pickAssignee(candidates, { reason: GmCallReasonEnum.RECOMMENDATION }),
    ).toBe('idle');
  });

  it('breaks ties with fewer explanations today', () => {
    const candidates = [
      candidate('busy', { gameplayCountToday: 4 }),
      candidate('calm', { gameplayCountToday: 1 }),
    ];

    expect(pickAssignee(candidates, {})).toBe('calm');
  });

  describe('question about the current game', () => {
    it('assigns whoever explained the game when available', () => {
      const candidates = [
        candidate('idle', { lastActivity: hourToSeconds('09:00:00') }),
        candidate('mentor', { lastActivity: hourToSeconds('15:00:00') }),
      ];

      expect(
        pickAssignee(candidates, {
          reason: GmCallReasonEnum.QUESTION,
          mentorId: 'mentor',
          game: 7,
        }),
      ).toBe('mentor');
    });

    it('falls back to someone who knows the game', () => {
      const candidates = [
        candidate('idle', { lastActivity: hourToSeconds('09:00:00') }),
        candidate('knows', {
          knownGames: new Set([7]),
          lastActivity: hourToSeconds('15:00:00'),
        }),
      ];

      expect(
        pickAssignee(candidates, {
          reason: GmCallReasonEnum.QUESTION,
          mentorId: 'mentor-on-break',
          game: 7,
        }),
      ).toBe('knows');
    });

    it('falls back to the most suitable game master', () => {
      const candidates = [
        candidate('a', { lastActivity: hourToSeconds('15:00:00') }),
        candidate('b', { lastActivity: hourToSeconds('09:00:00') }),
      ];

      expect(
        pickAssignee(candidates, {
          reason: GmCallReasonEnum.QUESTION,
          mentorId: 'mentor-on-break',
          game: 7,
        }),
      ).toBe('b');
    });
  });

  describe('explanation request', () => {
    it('assigns the most suitable person among those who know the game', () => {
      const candidates = [
        candidate('idle-unknown', { lastActivity: hourToSeconds('08:00:00') }),
        candidate('knows-recent', {
          knownGames: new Set([3]),
          lastActivity: hourToSeconds('15:00:00'),
        }),
        candidate('knows-idle', {
          knownGames: new Set([3]),
          lastActivity: hourToSeconds('11:00:00'),
        }),
      ];

      expect(
        pickAssignee(candidates, {
          reason: GmCallReasonEnum.EXPLANATION,
          game: 3,
        }),
      ).toBe('knows-idle');
    });

    it('waits instead of assigning someone who does not know the game', () => {
      const candidates = [
        candidate('a', { lastActivity: hourToSeconds('15:00:00') }),
        candidate('b', { lastActivity: hourToSeconds('09:00:00') }),
      ];

      expect(
        pickAssignee(candidates, {
          reason: GmCallReasonEnum.EXPLANATION,
          game: 3,
        }),
      ).toBeUndefined();
    });
  });
});

describe('findScheduledStaff', () => {
  const slots = [
    {
      shift: '10:00',
      shiftEndHour: '16:00',
      user: ['mert', 'ayse'],
      chefUser: 'ayse',
    },
    { shift: '16:00', shiftEndHour: '23:00', user: ['ali', 'mert'] },
  ];

  it('lists people in running and upcoming slots with their start hour', () => {
    const scheduled = findScheduledStaff(slots, '12:00:00');

    expect(scheduled.get('mert')).toBe('10:00');
    expect(scheduled.get('ali')).toBe('16:00');
  });

  it('includes service staff of the slot (last resort for GM calls)', () => {
    expect(findScheduledStaff(slots, '12:00:00').get('ayse')).toBe('10:00');
  });

  it('drops slots that have already ended', () => {
    const scheduled = findScheduledStaff(slots, '17:00:00');

    expect(scheduled.get('mert')).toBe('16:00');
    expect(scheduled.has('ayse')).toBe(false);
  });

  it('is empty after the last slot', () => {
    expect(findScheduledStaff(slots, '23:30:00').size).toBe(0);
  });

  it('keeps a slot that passes midnight ahead during the day', () => {
    const night = [{ shift: '20:00', shiftEndHour: '02:00', user: ['gece'] }];

    expect(findScheduledStaff(night, '12:00:00').get('gece')).toBe('20:00');
  });
});

describe('toAssignmentEvents', () => {
  it('adds who a call was taken over from', () => {
    const events = toAssignmentEvents([
      { user: 'ali', action: 'assigned', hour: '12:00:00' },
      { user: 'ayse', action: 'claimed', hour: '12:01:00' },
    ]);

    expect(events[1]).toEqual({
      user: 'ayse',
      action: 'claimed',
      hour: '12:01:00',
      fromUser: 'ali',
    });
  });

  it('has nobody to take over from after a decline', () => {
    const events = toAssignmentEvents([
      { user: 'ali', action: 'assigned', hour: '12:00:00' },
      { user: 'ali', action: 'declined', hour: '12:02:00' },
      { user: 'ayse', action: 'claimed', hour: '12:05:00' },
    ]);

    expect(events[2]!.fromUser).toBeUndefined();
  });

  it('follows a chain of take-overs', () => {
    const events = toAssignmentEvents([
      { user: 'ali', action: 'assigned', hour: '12:00:00' },
      { user: 'ayse', action: 'claimed', hour: '12:01:00' },
      { user: 'mert', action: 'claimed', hour: '12:03:00' },
    ]);

    expect(events.map((e) => e.fromUser)).toEqual([undefined, 'ali', 'ayse']);
  });
});

describe('pickAssigneeServiceStaffLast', () => {
  const service = (
    userId: string,
    overrides: Partial<AssignmentCandidate> = {},
  ) => candidate(userId, { isServiceStaff: true, ...overrides });

  it('prefers anyone else over the service staff, even if they waited longer', () => {
    const candidates = [
      service('service', { lastActivity: hourToSeconds('08:00:00') }),
      candidate('gm', { lastActivity: hourToSeconds('15:00:00') }),
    ];

    expect(pickAssigneeServiceStaffLast(candidates, {})).toBe('gm');
  });

  it('assigns the service staff when nobody else is available', () => {
    expect(pickAssigneeServiceStaffLast([service('service')], {})).toBe(
      'service',
    );
  });

  it('does not let a service staff mentor jump the line for a question', () => {
    const candidates = [
      service('mentor'),
      candidate('gm', { knownGames: new Set([7]) }),
    ];

    expect(
      pickAssigneeServiceStaffLast(candidates, {
        reason: GmCallReasonEnum.QUESTION,
        mentorId: 'mentor',
        game: 7,
      }),
    ).toBe('gm');
  });

  it('gives an explanation to a service staff who knows the game when no one else does', () => {
    const candidates = [
      candidate('gm'),
      service('service', { knownGames: new Set([3]) }),
    ];

    expect(
      pickAssigneeServiceStaffLast(candidates, {
        reason: GmCallReasonEnum.EXPLANATION,
        game: 3,
      }),
    ).toBe('service');
  });

  it('never gives an explanation to a service staff who does not know the game', () => {
    expect(
      pickAssigneeServiceStaffLast([service('service')], {
        reason: GmCallReasonEnum.EXPLANATION,
        game: 3,
      }),
    ).toBeUndefined();
  });
});

describe('service staff and outside operation are for the whole day', () => {
  // As the panel saves them: per slot, without end hours, overlapping.
  const slots = [
    {
      shift: '10:00',
      user: ['ceren', 'kemal'],
      chefUser: 'ceren',
      outsideOperationUsers: ['kemal'],
    },
    { shift: '16:00', user: ['mert', 'ali'], chefUser: 'mert' },
  ];

  it('finds the service staff of every slot of the day', () => {
    expect(findServiceStaff(slots).sort()).toEqual(['ceren', 'mert']);
    expect(findServiceStaff([])).toEqual([]);
  });

  it('finds everyone outside operation on the day', () => {
    expect(findOutsideOperationStaff(slots)).toEqual(['kemal']);
  });

  it('leaves people outside operation out of the scheduled staff', () => {
    const scheduled = findScheduledStaff(
      [
        ...slots,
        { shift: '18:00', user: ['kemal'] }, // also in a later slot
      ],
      '09:00:00',
    );

    expect(scheduled.has('kemal')).toBe(false);
    expect(scheduled.get('ceren')).toBe('10:00');
  });
});

describe('pickServiceCallAssignee', () => {
  it('prefers service staff, longest idle first', async () => {
    expect(
      pickServiceCallAssignee([
        candidate('gm', { lastActivity: hourToSeconds('09:00:00') }),
        candidate('busy-service', {
          isServiceStaff: true,
          lastActivity: hourToSeconds('11:00:00'),
        }),
        candidate('idle-service', {
          isServiceStaff: true,
          lastActivity: hourToSeconds('10:00:00'),
        }),
      ]),
    ).toBe('idle-service');
  });

  it('falls back to any free game master', () => {
    expect(
      pickServiceCallAssignee([
        candidate('ali', { lastActivity: hourToSeconds('11:00:00') }),
        candidate('ayse', { lastActivity: hourToSeconds('10:00:00') }),
      ]),
    ).toBe('ayse');
  });

  it('returns undefined when nobody is free', () => {
    expect(pickServiceCallAssignee([])).toBeUndefined();
  });
});
