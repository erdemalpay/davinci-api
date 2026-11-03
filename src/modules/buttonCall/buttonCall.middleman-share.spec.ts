import {
  BusyRecord,
  countMiddlemanShares,
  findMiddlemanHoursSeconds,
  MiddlemanRecord,
  MiddlemanShare,
  middlemanRatio,
  pickPlannedMiddleman,
} from './buttonCall.assignment';

const HOUR = 3600;

const record = (
  user: string,
  startHour: string,
  finishHour: string | undefined,
  overrides: Partial<MiddlemanRecord> = {},
): MiddlemanRecord => ({
  user,
  location: 1,
  date: '2026-10-30',
  startHour,
  finishHour,
  ...overrides,
});

const busyAt = (
  user: string,
  startHour: string,
  finishHour: string,
  date = '2026-10-30',
): BusyRecord => ({ user, date, startHour, finishHour });

const shareOf = (seconds: number, workedSeconds: number): MiddlemanShare => ({
  seconds,
  workedSeconds,
  dates: [],
});

describe('findMiddlemanHoursSeconds', () => {
  it('counts only the part of a shift within 14:00–22:00', () => {
    const seconds = findMiddlemanHoursSeconds([
      { shift: '10:00', shiftEndHour: '18:00', user: ['morning'] },
      { shift: '18:00', shiftEndHour: '02:00', user: ['night'] },
      { shift: '14:00', shiftEndHour: '22:00', user: ['middle'] },
    ]);

    expect(seconds.get('morning')).toBe(4 * HOUR); // 14:00–18:00
    expect(seconds.get('night')).toBe(4 * HOUR); // 18:00–22:00
    expect(seconds.get('middle')).toBe(8 * HOUR);
  });

  it('counts an evening shift that starts after 18:00', () => {
    const seconds = findMiddlemanHoursSeconds([
      { shift: '19:30', shiftEndHour: '23:30', user: ['late'] },
    ]);

    expect(seconds.get('late')).toBe(2.5 * HOUR);
  });

  it('leaves out a shift entirely outside the middleman hours', () => {
    const seconds = findMiddlemanHoursSeconds([
      { shift: '08:00', shiftEndHour: '13:00', user: ['early'] },
    ]);

    expect(seconds.has('early')).toBe(false);
  });

  it('counts overlapping slots of the same person once', () => {
    const seconds = findMiddlemanHoursSeconds([
      { shift: '12:00', shiftEndHour: '18:00', user: ['double'] },
      { shift: '16:00', shiftEndHour: '20:00', user: ['double'] },
    ]);

    expect(seconds.get('double')).toBe(6 * HOUR); // 14:00–20:00
  });

  it('takes the end hour from the location shifts when the slot has none', () => {
    const seconds = findMiddlemanHoursSeconds(
      [{ shift: '16:00', user: ['ali'] }],
      [{ shift: '16:00', shiftEndHour: '20:00' }],
    );

    expect(seconds.get('ali')).toBe(4 * HOUR);
  });

  it('leaves out service staff and people outside operation', () => {
    const seconds = findMiddlemanHoursSeconds([
      {
        shift: '14:00',
        shiftEndHour: '22:00',
        user: ['gm', 'service', 'outside'],
        chefUser: 'service',
        outsideOperationUsers: ['outside'],
      },
    ]);

    expect([...seconds.keys()]).toEqual(['gm']);
  });
});

describe('countMiddlemanShares', () => {
  const fullDay = {
    day: '2026-10-30',
    slots: [{ shift: '14:00', shiftEndHour: '22:00', user: ['kemal', 'mert'] }],
    locationShifts: [],
  };

  it('adds up middleman time and the time worked in the middleman hours', () => {
    const shares = countMiddlemanShares(
      [
        record('kemal', '14:00', '17:00'),
        record('kemal', '19:00', '20:30'),
        record('mert', '17:00', '19:00'),
      ],
      [fullDay, { ...fullDay, day: '2026-10-31' }],
      [],
    );

    expect(shares.get('kemal')).toMatchObject({
      seconds: 4.5 * HOUR,
      workedSeconds: 16 * HOUR,
    });
    expect(shares.get('mert')).toMatchObject({
      seconds: 2 * HOUR,
      workedSeconds: 16 * HOUR,
    });
  });

  it('takes out the time on a call, explaining a game or on a break', () => {
    const shares = countMiddlemanShares(
      [record('kemal', '14:00', '18:00')],
      [fullDay],
      [
        busyAt('kemal', '14:30', '14:45'), // call
        busyAt('kemal', '15:00', '15:40'), // explaining
        busyAt('kemal', '15:30', '16:00'), // break, overlaps the game
        busyAt('kemal', '17:50', '18:30'), // runs past the middleman time
      ],
    );

    // 4h minus 15m, 60m (15:00–16:00) and 10m.
    expect(shares.get('kemal').seconds).toBe(4 * HOUR - 85 * 60);
  });

  it('ignores busy time of another day or another person', () => {
    const shares = countMiddlemanShares(
      [record('kemal', '14:00', '16:00')],
      [fullDay],
      [
        busyAt('kemal', '14:00', '15:00', '2026-10-29'),
        busyAt('mert', '14:00', '15:00'),
        {
          user: 'kemal',
          date: '2026-10-30',
          startHour: '15:00',
          finishHour: '',
        },
      ],
    );

    expect(shares.get('kemal').seconds).toBe(2 * HOUR);
  });

  it('counts the time standing in for the middleman to the stand-in', () => {
    const shares = countMiddlemanShares(
      [
        record('kemal', '14:00', '18:00'),
        record('mert', '16:00', '16:30', { coveringFor: 'kemal' }),
      ],
      [fullDay],
      [],
    );

    expect(shares.get('mert').seconds).toBe(30 * 60);
    // Only the day's own middleman is shown as the day's middleman.
    expect(shares.get('kemal').dates).toEqual(['2026-10-30']);
    expect(shares.get('mert').dates).toEqual([]);
  });

  it('skips records that are still going on', () => {
    const shares = countMiddlemanShares(
      [record('kemal', '14:00', undefined)],
      [fullDay],
      [],
    );

    expect(shares.get('kemal').seconds).toBe(0);
  });

  it('counts a middleman time that runs past midnight', () => {
    const shares = countMiddlemanShares(
      [record('kemal', '23:00', '01:00')],
      [],
      [busyAt('kemal', '00:15', '00:45')],
    );

    expect(shares.get('kemal').seconds).toBe(1.5 * HOUR);
  });
});

describe('middlemanRatio', () => {
  it('is the middleman time per time worked, 0 without work', () => {
    expect(middlemanRatio(shareOf(2 * HOUR, 8 * HOUR))).toBe(0.25);
    expect(middlemanRatio(shareOf(HOUR, 0))).toBe(0);
    expect(middlemanRatio(undefined)).toBe(0);
  });
});

describe('pickPlannedMiddleman', () => {
  it('returns undefined without candidates', () => {
    expect(pickPlannedMiddleman([], new Map())).toBeUndefined();
  });

  it('picks the lowest share of time worked, not the least time', () => {
    const shares = new Map([
      // Little middleman time but worked little: 25%.
      ['parttime', shareOf(2 * HOUR, 8 * HOUR)],
      // More middleman time but worked a lot: 10%.
      ['fulltime', shareOf(8 * HOUR, 80 * HOUR)],
    ]);

    expect(pickPlannedMiddleman(['parttime', 'fulltime'], shares)).toBe(
      'fulltime',
    );
  });

  it('picks someone without any middleman time first', () => {
    const shares = new Map([['kemal', shareOf(HOUR, 40 * HOUR)]]);

    expect(pickPlannedMiddleman(['kemal', 'kagan'], shares)).toBe('kagan');
  });

  it('breaks a ratio tie with the least middleman time', () => {
    const shares = new Map([
      ['more', shareOf(4 * HOUR, 40 * HOUR)],
      ['less', shareOf(2 * HOUR, 20 * HOUR)],
    ]);

    expect(pickPlannedMiddleman(['more', 'less'], shares)).toBe('less');
  });

  it('picks randomly among a full tie', () => {
    const shares = new Map<string, MiddlemanShare>();

    expect(pickPlannedMiddleman(['a', 'b', 'c'], shares, () => 0)).toBe('a');
    expect(pickPlannedMiddleman(['a', 'b', 'c'], shares, () => 0.99)).toBe('c');
  });
});
