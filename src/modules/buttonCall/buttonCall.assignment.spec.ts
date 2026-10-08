import {
  AssignmentCandidate,
  findScheduledStaff,
  findServiceStaff,
  hourToSeconds,
  pickAssignee,
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

describe('findServiceStaff', () => {
  const slots = [
    { shift: '10:00', chefUser: 'morning-service' },
    { shift: '16:00', shiftEndHour: '23:00', chefUser: 'evening-service' },
  ];

  it('returns the service staff of the slot covering the hour', () => {
    expect(findServiceStaff(slots, '12:30:00')).toBe('morning-service');
    expect(findServiceStaff(slots, '18:00:00')).toBe('evening-service');
  });

  it('ends a slot without an end hour when the next one starts', () => {
    expect(findServiceStaff(slots, '16:00:00')).toBe('evening-service');
  });

  it('returns undefined outside every slot', () => {
    expect(findServiceStaff(slots, '09:00:00')).toBeUndefined();
    expect(findServiceStaff(slots, '23:30:00')).toBeUndefined();
  });

  it('handles slots that pass midnight', () => {
    const night = [
      { shift: '18:00', shiftEndHour: '02:00', chefUser: 'night-service' },
    ];
    expect(findServiceStaff(night, '01:00:00')).toBe('night-service');
    expect(findServiceStaff(night, '03:00:00')).toBeUndefined();
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

  it('leaves out service staff of the slot', () => {
    expect(findScheduledStaff(slots, '12:00:00').has('ayse')).toBe(false);
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
