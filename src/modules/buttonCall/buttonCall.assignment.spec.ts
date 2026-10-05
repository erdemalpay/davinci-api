import {
  AssignmentCandidate,
  findServiceStaff,
  hourToSeconds,
  pickAssignee,
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

    it('falls back to anyone when nobody knows the game', () => {
      const candidates = [
        candidate('a', { lastActivity: hourToSeconds('15:00:00') }),
        candidate('b', { lastActivity: hourToSeconds('09:00:00') }),
      ];

      expect(
        pickAssignee(candidates, {
          reason: GmCallReasonEnum.EXPLANATION,
          game: 3,
        }),
      ).toBe('b');
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
